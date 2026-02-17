# MobileCoin DEX: System Design

Traditional centralized exchanges (Binance, Coinbase) hold user keys - if they are hacked or regulated, user funds are lost or frozen. Traditional DEXs (Uniswap) run on public ledgers where every trade, amount, and wallet address is visible to the world.

**Solution:** A DEX that combines the privacy of MobileCoin (hidden senders, receivers, and amounts) with the security of [atomic swaps](./09_glossary.md#atomic-swap) (trustless trading). Users trade MOB, BTC, ETH, USDC, and USDT privately and without trusting a middleman.

This document covers the core technologies, architecture considerations, and engineering details in sequence. Each section explains what the component is, why it matters for a privacy-focused DEX, and what decisions depend on it. Sections reference each other where relevant.

---

## Table of Contents

1. [Fog: Private Transaction Discovery](#1-fog-private-transaction-discovery)
2. [SCI: The Trustless Swap Primitive](#2-sci-the-trustless-swap-primitive)
   - [Partial Fills (MCIP 42)](#partial-fills-mcip-42)
3. [DEQS: The Order Book](#3-deqs-the-order-book)
4. [Ring Signatures: Transaction Privacy](#4-ring-signatures-transaction-privacy)
5. [WASM: Running Crypto in the Browser](#5-wasm-running-crypto-in-the-browser)

**See also:** [Architecture Decisions](./02_architecture_decisions.md) · [Glossary](./09_glossary.md)

---

## 1. Fog: Private Transaction Discovery

To show a user their balance or confirm that a trade settled, the DEX app needs to read the MobileCoin blockchain. But MobileCoin encrypts everything - there is no public explorer like Etherscan. Without some discovery mechanism, the only option would be downloading the entire chain and trying every transaction against the user's keys, which is way too slow for a web or mobile app.

This is where **Fog** comes in - a server-side service provided by MobileCoin that solves exactly this problem. It runs inside tamper-proof hardware (an **Intel [SGX enclave](./09_glossary.md#sgx-enclave)**). A user gives Fog a detection key derived from their **View Key**. Fog scans all new blocks and returns only the transactions that belong to that user - without ever learning what those transactions contain or who the user is.

**What this means for the DEX:**

- The frontend would need to connect to a **Fog endpoint** to display balances and detect incoming payments. There is no alternative.
- Every user address generated needs to be **Fog-enabled** (registered with a **Fog Report URL**) so payments to users can be discovered.
- If Fog goes down, wallets go blind - planning for redundancy or self-hosting is important.

> **Note:** Fog is a hard dependency for any MobileCoin-based application. It is not optional.

<details>
<summary><strong>Things to Verify</strong></summary>

- How does a new user's view key get registered with the Fog ingest enclave? The process is not well-documented for third-party integrations.
- Is there a delay between Fog key registration and the first balance scan? Test timing on testnet.
- Can we run our own Fog ingest service, or must we use MobileCoin Foundation's? What are the hardware requirements (SGX dependency)?
- What happens if the Fog ingest service goes down - do users permanently lose visibility of their balances, or does it recover retroactively?
- **To do:** Study `fog/ingest/` source code and document the exact flow: key generation → Fog registration → first balance visibility.

</details>

---

## 2. SCI: The Trustless Swap Primitive

For a [non-custodial](./09_glossary.md#non-custodial) DEX, two users need to swap assets without any middleman holding funds. One user says *"I'll give you X, but only if you give me Y in the same transaction."* Without a mechanism for this kind of conditional spending, either a trusted third party must custody funds during the trade, or one party must send first and hope the other reciprocates.

MobileCoin solves this with **[SCI](./09_glossary.md#sci)** (Signed Contingent Input, defined in [MCIP 31](https://github.com/mobilecoinfoundation/mcips/blob/main/text/0031-transactions-with-contingent-inputs.md)) - a cryptographically signed instruction that says: "Spend this input of mine, but ONLY if the transaction also includes an output paying me the asset I want." Anyone who receives the SCI can complete the trade, but only by fulfilling the condition - they cannot steal the funds.

**How it would work on the DEX:**

A **maker** creates an SCI ("sell 10 MOB for 1 eUSD"), and a **taker** completes it by adding their own funds to the transaction.

- **Zero gas to propose** - creating an SCI costs nothing; the taker pays the network fee when they fill it. A major UX win over Ethereum DEXes.
- **Privacy preserved** - SCIs do not reveal the maker's address or which specific coin they own (**[ring signatures](./09_glossary.md#ring-signatures)** hide it, see [Section 4](#4-ring-signatures-transaction-privacy)). They only reveal the token type and amount.
- **Cancellation** - the maker can cancel an SCI at any time by simply spending the input to themselves.
- **No [MEV](./09_glossary.md#mev)** ( Maximal Extractable Value ) - consensus nodes never see the SCI proposal, only the final settled transaction. Front-running is not possible.

For a visual explanation of how an SCI transaction works (valid match vs. theft attempt), see [Diagrams: SCI Mechanics](./03_diagrams.md#sci-mechanics).

### Partial Fills (MCIP 42)

A user wants to sell 100 MOB. A buyer only wants 30. With basic SCIs, it's all-or-nothing - every order must be matched exactly, killing [liquidity](./09_glossary.md#liquidity).

[MCIP 42](https://github.com/mobilecoinfoundation/mcips/blob/main/text/0042-partial-fill-rules.md) lets us fill just the 30 MOB portion.

**The catch:** After any [partial fill](./09_glossary.md#partial-fill), the original SCI is consumed (the **[key image](./09_glossary.md#key-image)** is burned). The maker must create a new SCI for the remaining 70 MOB. The system would need to handle this - see [Architecture Decisions: Partial Fill Mechanics](./02_architecture_decisions.md#3-partial-fill-mechanics) for the detailed engineering approach.

> **Note:** SCI is the core primitive that would make every trade on the DEX non-custodial. Every architecture decision below ultimately feeds into how SCIs are created, stored, matched, and settled.

<details>
<summary><strong>Things to Verify</strong></summary>

- **Cancellation cost:** Cancelling an SCI requires an on-chain transaction (which costs a fee). Users may expect "free" cancellation. How do we communicate this? Could a very short [tombstone block](./09_glossary.md#tombstone-block) serve as gas-free expiry?
- **Cancellation race:** Between clicking cancel and consensus (~5 seconds), the order could be filled. Design a UX flow with clear warnings.
- **Offline cancellation:** If the browser tab is closed, the user cannot cancel. Is there a way to support server-side cancellation without taking custody?
- **DEQS propagation delay:** After cancellation, how long until the order disappears from the book? Measure end-to-end latency.
- **Protocol compatibility:** SCI (MCIP 31) and Partial Fills (MCIP 42) require block version 3. Verify current mainnet block version independently. Check Full-Service for block version handling in transaction building. Review MobileCoin's upgrade schedule for planned changes.
- **To do:** Measure cancellation latency end-to-end on testnet; verify mainnet block version by querying a MobileCoin node.

</details>

---

## 3. DEQS: The Order Book

Once a maker creates an SCI, it needs to be visible to potential takers. We need a service that stores, validates, and distributes SCIs - and building one from scratch means implementing SCI validation, key-image monitoring (to detect filled/cancelled orders), storage, and distribution. That's substantial engineering effort.

Fortunately, [DEQS](./09_glossary.md#deqs) (Decentralized Exchange Quote Service) already exists as MobileCoin's order book implementation.

**What DEQS provides:**

- A **QuoteBook** (stores SCIs with metadata: trading pair, price, timestamp)
- Automatic **key-image monitoring** (removes filled/cancelled orders via **SynchronizedQuoteBook**)
- **gRPC API**: `SubmitQuotes` (batch up to 30), `GetQuotes` (filter by pair/range), `LiveUpdates` (real-time streaming)
- **P2P quote distribution** between nodes
- SQLite or in-memory storage
- A reference **liquidity-bot** for automated market-making

**Limitations:** DEQS only supports single-pair trades - no complex multi-leg swaps. Whether to use DEQS or build our own order book is a key architecture decision. See [Architecture Decisions: Codebase & Order Book](./02_architecture_decisions.md#5-codebase--order-book-antelope-fork-vs-from-scratch-deqs-vs-custom) for the full comparison.

> **Note:** DEQS already solves the hardest backend problems - SCI storage, validation, and cleanup. Building this from scratch would duplicate months of work.

<details>
<summary><strong>Things to Verify</strong></summary>

- DEQS is Rust/gRPC; our backend (Antelope fork) is Python/FastAPI. Can we run DEQS as a standalone service and connect from Python comfortably, or does the language boundary create too much friction?
- DEQS uses [`LedgerDB`](./09_glossary.md#ledgerdb) (LMDB) for ring validation. Does it require a full MobileCoin node colocated?
- How fast does `SynchronizedQuoteBook` detect spent key images? Measure latency on testnet.
- Is P2P quote distribution needed for a single-operator DEX, or only for decentralized multi-node deployments?
- What are the resource requirements (RAM, disk, CPU) at 1K / 10K / 100K active quotes?
- **To do:** Deploy DEQS on testnet and test the full `SubmitQuotes → GetQuotes → LiveUpdates → key-image cleanup` flow. Measure resource consumption. Test Python ↔ gRPC integration.

</details>

---

## 4. Ring Signatures: Transaction Privacy

A privacy-focused DEX needs private trading. But when a user spends MobileCoin, how do we prevent blockchain observers from identifying them? On most blockchains, every transaction reveals the exact input being spent, making the sender identifiable and enabling front-running.

MobileCoin takes a different approach: when spending a coin, it mixes the real input with 10 random "decoy" inputs (called **mixins**) from the blockchain. The resulting cryptographic proof shows that one of the 11 inputs was spent, but not which one.

**What this means for the DEX:**

- Traders cannot be identified by observers watching the blockchain.
- Front-running is impossible because nobody can see who is trading or what.
- **MCIP 57 fix:** When SCIs are present, mixin uniqueness is checked within each input ring - not across all rings. Without this fix, a significant percentage of multi-input trades would randomly fail due to accidental ring collisions.

---

## 5. WASM: Running Crypto in the Browser

If a web-based frontend is chosen (the suggested approach - see [Architecture Decisions: Frontend Platform](./02_architecture_decisions.md#1-frontend-platform)), the user's browser would need to create SCIs, sign transactions, and manage keys. This requires heavy cryptography (**Ristretto255** elliptic curves) that JavaScript can't handle reliably or securely.

**WebAssembly ([WASM](./09_glossary.md#wasm))** solves this by letting us compile MobileCoin's Rust crypto libraries into compact binaries that run in the browser at near-native speed. The user's private keys never leave their browser tab.

**What this means for the DEX:**

- The frontend would not just be a "display layer" - it would be a full wallet doing real cryptography.
- SCI creation and transaction signing would all happen client-side. No private key material touches the server.
- **Open question:** MobileCoin's `mc-transaction-builder` has not been publicly compiled to WASM yet - this is the single biggest technical risk for the web-first approach.

<details>
<summary><strong>Things to Verify</strong></summary>

- MobileCoin's Rust stack has deep dependencies: `mc-crypto-ring-signature`, `mc-crypto-keys` (Ristretto255), Bulletproofs, MLSAG. These use `OsRng` which must be mapped to browser `crypto.getRandomValues()`. Will it compile?
- `mc-fog-report-validation` makes network calls to Fog report servers. In WASM, this must go through `fetch()` which has CORS restrictions.
- The resulting WASM bundle size could be prohibitively large (Bulletproofs + ring signature libraries). If >10MB, initial load time hurts UX.
- No known public example exists. The `fog/sample-paykit` has `build_swap_proposal()` and `build_swap_transaction()` methods that might be the best compilation target - unverified.
- **Fallback:** Could we use Full-Service as a local signer service instead of WASM if compilation fails?
- **To do:** Attempt to compile `mc-transaction-builder` to wasm32, catalog errors, measure bundle size, and benchmark SCI creation time in WASM vs native Rust.

</details>
