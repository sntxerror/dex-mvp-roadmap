# Initial Research

## 1. Document Review & Concept Extraction

### A. Core MobileCoin Mechanics
*   **Privacy by Default:** Ring Signatures (sender privacy), Stealth Addresses (receiver privacy), and RingCT (amount privacy) ensure that while the *existence* of valid transactions is verified by validators, the *details* are obfuscated.
*   **Fog:** A scalable service that enables mobile and light clients to query the blockchain efficiently.
    *   **The Problem:** Privacy coins like MobileCoin encrypt the receiver. To know if you received money, you normally have to try to unlock *every* transaction on the ledger with your private keys. This burns battery and bandwidth on phones.
    *   **The Solution:** An Oblivious Query service. The client sends a "View Key" derived packet to Fog. Fog scans the ledger on behalf of the user and returns *only* the relevant transaction outputs (UTXOs) that belong to the user, without Fog knowing *what* those transactions contain or *who* the user is (thanks to SGX enclaves + oblivious transfer).
    *   **Relevance:** The proposed DEX frontend (React) would connect to a Fog Service to know the user's balance and find inputs to create SCIs.
*   **Consensus:** Federated Byzantine Agreement (FBA). Fast settlement (sub-5 seconds), no mining, energy-efficient.

### B. MCIP 31: Transactions with Contingent Inputs
*   **Concept:** "Trustless Atomic Swaps".
*   **Mechanism:** A user signs an input (spending their funds) but attaches a cryptographic **Contingency**.
    *   *Rule:* "I authorize spending this input ONLY IF Output X (Asset Y, Amount Z, to Address W) is created in the same transaction."
*   **Result:** A "Signed Contingent Input" (SCI) is a transferable **Transaction Fragment**. It can be broadcast publicly without risk of theft, as it cannot be spent unless the signer gets paid.
*   **Cancellation:** Unlike a database entry, an SCI is a valid signature on the blockchain. To "Cancel" an order, the user **must spend the input to themselves** in a new transaction. This "burns" the Key Image, making the original SCI invalid (Double Spend protection).
*   **Why is it Atomic?**
    *   In database theory, "Atomicity" means "all or nothing".
    *   In MobileCoin, a transaction is a single unit of work submitted to the consensus network.
    *   The transaction contains **Inputs** (Alice's money + Bob's money) and **Outputs** (money to Bob + money to Alice).
    *   The validators check the entire bundle. If *any* signature is invalid, or if *any* contingency rule is not met (e.g., Alice didn't get paid), the **entire transaction is rejected**.
    *   It is mathematically impossible for Alice to lose her funds without receiving the asset, because the spending of her input is cryptographically bound to the creation of her payment.

### C. MCIP 42: Partial Fill Rules
*   **Concept:** "Limit Orders via SCI".
*   **Constraint:** Standard SCIs are "All-or-Nothing". If Alice wants to sell 100 MOB, Bob must buy exaclty 100 MOB.
*   **Optimization:** MCIP 42 allows an SCI to specify logic for partial consumption.
    *   *Rule:* "You can spend fraction $f$ of this input, provided you pay me fraction $f$ of the requested output, and return $(1-f)$ of the input to me as change."
    *   **Griefing Protection:** To prevent "Dust Attacks" (filling 0.000001% of an order to force a new change output and waste fees), the Originator sets a `min_fill_value`.
    *   **Amount Shared Secret:** To allow the Taker (or Matcher) to prove to the Enclave that the math is correct without revealing the user's private view key, a derived "Amount Shared Secret" is used to unmask *just* the value for validation.
*   **Security:** Consensus validators verify the arithmetic to ensure no value is lost or stolen.

### D. FireDex & Antelope Concepts
*   **FireDex:** A reference design for a non-custodial exchange.
    *   **Governance:** Designed as a DAO with a `FIDX` token. (Note: The initial prototype could use a static Federation, evolving into a DAO later).
    *   **Compliance:** FireDex proposes a KYC-permissioned bridge. **Difference:** This proposal targets a *permissionless* P2P architecture.
*   **Antelope:** Existing implementation of an RFQ (Request for Quote) system.
    *   *Current State:* Broker-Dealer model (User trades against Antelope).
    *   *Relevance:* Provides the scaffolding (Wallet management, Block scanning, API structure) but requires refactoring to support Peer-to-Peer SCI matching instead of Dealer execution.
    *   *DTR:* Direct-to-Retail module handles Fiat/KYC. This is **Out of Scope** for the initial DEX.

## 2. Key Scenarios

### Scenario A: Maker Places Limit Order (BTC -> MOB)
1.  **Preparation:** Maker deposits BTC into the Bridge Federation, receiving `wBTC` (MobileCoin-wrapped BTC) into their wallet.
2.  **Order Creation:** Maker wants to sell 1 `wBTC` for 10,000 `MOB`.
3.  **Signing:** Maker generates an SCI:
    *   Spends: 1 `wBTC`.
    *   Requires: 10,000 `MOB` to Maker's address.
    *   Partial Fill: Allowed (Min fill: 0.01 `wBTC`).
4.  **Publishing:** Maker posts this signed blob to the **Order Discovery Service**.
5.  **State:** Order is "Open". Funds are still in Maker's wallet (but effectively locked if they want this order to remain valid).

### Scenario B: Taker Fills Order (MOB -> BTC)
1.  **Discovery:** Taker browses `MOB/wBTC` pair on the Order Discovery Service.
2.  **Selection:** Taker sees Maker's order (1 `wBTC` @ 10k `MOB`) and decides to buy 0.5 `wBTC`.
3.  **Construction:** Taker's client:
    *   Fetches Maker's SCI.
    *   Calculates split: 0.5 `wBTC` (Fill) / 0.5 `wBTC` (Change).
    *   Adds Taker's Input: 5,000 `MOB` (+ tx fees).
    *   Adds Maker's Output: 5,000 `MOB`.
    *   Adds Taker's Output: 0.5 `wBTC`.
    *   Adds Change Outputs: Remainder `MOB` back to Taker, Remainder `wBTC` back to Maker.
4.  **Submission:** Taker signs and broadcasts the final transaction.

### Scenario C: Settlement & Verification
1.  **Consensus:** MobileCoin Validators receive the transaction.
2.  **Checks:**
    *   Are Maker's and Taker's inputs unspent?
    *   Does the transaction satisfy the SCI contingency? (Did Maker get 5000 MOB?)
    *   Does the Partial Fill math check out? (Is 0.5/1.0 equal to 5000/10000?)
3.  **Commit:** Transaction is written to the ledger.
4.  **Index:** Fog/Block-Scanners see the input is spent. Order Discovery Service removes the "Filled" portion of the order.

## 3. High-Level Operations Architecture

### Roles & Services
*   **User Client (Frontend):** React App. Manages private keys, specifically responsible for signing SCIs and final Transactions.
*   **Discovery Service (Backend):** The "Marketplace". Stores and serves SCIs. Does not hold funds or keys.
*   **MobileCoin Network:** The settlement layer.
*   **Bridge Service:** Trusted entity for cross-chain wrapping.

### Diagrams
Please see [diagrams.md](./03_diagrams.md) for Sequence and UML Charts.

## 4. Concepts: Broker-Dealer vs DTR vs DEX

### What is DTR?
In the context of the `Antelope` codebase, **DTR** stands for **"Direct To Retail"**. It represents a module integrating with a specific partner or API that handles Fiat on/off-ramps (Bank transfers, Debit cards) and the associated KYC (Know Your Customer) / AML (Anti-Money Laundering) checks.
*   **Role in Antelope:** It allows the application to sell crypto for USD.
*   **Relevance to this proposal:** Since the requirement is "Non-KYC" and "Crypto-to-Crypto", this module is technical debt. It would be disabled or removed to keep the DEX permissionless.

### Broker-Dealer Model (Current Antelope)
Antelope currently operates as a **Dealer**.
1.  **RFQ (Request for Quote):** The user asks "How much for 10 MOB?".
2.  **Quote:** The server checks external exchanges (BigOne), adds a spread/fee, and offers a price to the user.
3.  **Trade:** If the user accepts, they pay the *Server*. The Server then pays the user the asset.
4.  **Implication:** The Server (Antelope) is a counterparty. It takes custody of funds and executes the trade.

### P2P DEX Model (Proposed Goal)
The proposal targets a **Peer-to-Peer** model.
1.  **Order Book:** The Server is just a Bulletin Board.
2.  **Trade:** Users trade with *each other*. The Server never touches the funds.
3.  **Matching:** The Server helps users find each other, but the "Trade" is a direct atomic swap on the blockchain.

## 5. Partial Fulfillment Scenarios

MCIP 42 allows a "Partial Fill". This means if Alice executes a Signed Contingent Input (SCI) for 100 MOB, she authorizes anyone to take *less* than 100, provided the *price ratio* is preserved.

**The Mechanics:**
*   **Input:** Alice's 100 MOB unspent output.
*   **Taker Action:** Bob wants 20 MOB. He references Alice's SCI but constructs a transaction consuming only 20% of it.
*   **Output 1:** 20 MOB to Bob.
*   **Output 2 (Payment):** Bob's payment (e.g. 0.002 BTC) to Alice.
*   **Output 3 (Change):** **80 MOB returned to Alice**.
*   *Result:* Alice now has a *new* unspent output of 80 MOB. Her original SCI (for 100) is now "spent" and invalid. She must (or her software must) create a *new* SCI for the remaining 80 MOB if she wants to keep selling.

### Scenario A: Real-time "Automatic" Fulfillment
In this scenario, the DEX acts like a standard centralized exchange (CEX) UI, but non-custodially.

1.  **Order:** Alice places a large Sell Order (1000 MOB).
2.  **Taker 1:** Bob comes in to buy 200 MOB (Market Buy).
3.  **System:**
    *   Finds Alice's order.
    *   Constructs a transaction for Bob filling 20% of Alice's order.
    *   Bob signs and submits.
4.  **Auto-Restock:**
    *   Alice's client (running in background or via Fog) detects the trade.
    *   It sees she received 200 MOB worth of BTC and has 800 MOB change.
    *   **Automatically** generates a new SCI for the remaining 800 MOB and posts it to the Order Book.
5.  **Taker 2:** Charlie buys 100 MOB. He fills part of the *new* 800 MOB order.

*Pros:* Seamless experience for the Maker.
*Cons:* Requires Maker to be online/active to re-sign the new remainder, OR requires the SCI protocol to support "Recursive Covenants" (limitations of current MCIP 42 may require manual re-signing).

### Scenario B: Manual P2P Fulfillment (The "Binance" Limit Order style)
In this scenario, the Order Book manages the complexity.

1.  **Order:** Alice posts an order for 1000 MOB.
2.  **Display:** The Order Book displays "1000 MOB Available".
3.  **Taker 1:** Bob fills 200.
    *   The transaction settles. Alice gets 800 change.
    *   The Order Book sees the explicit spend.
4.  **State Update:**
    *   The Order Book marks the original SCI as "Filled/Dead".
    *   Alice's order effectively **disappears** from the book until she takes action.
    *   *OR:* If MCIP 42 supports a "residual key" that allows the remainder to remain offerable without new signature (advanced/unlikely in v1), it stays.
    *   *Most likely:* Alice sees her order is "Partially Filled (20%)" and "Cancelled (80%)" due to technical change-output mechanics. She must click "Relist Remainder" to sell the rest.

## 6. Automated Matching Engine (The "Solver" Model)

You asked for a system where users just "Post Orders" and the platform passively connects them, behaving like a standard CEX (Centralized Exchange) but trustlessly.

### The Problem with "Two Makers"
In a typical SCI flow, there is a **Maker** (Passive, signs SCI) and a **Taker** (Active, signs Tx).
If Alice posts "Sell 10 MOB" (SCI) and Bob posts "Buy 10 MOB" (SCI), they are both Passive. *Who constructs the transaction?*

### The Solution: The Matcher (Solver) Node
The design could introduce a specific service called the **Matcher**.

1.  **Alice (Maker A):** Signs SCI "Spend 10 MOB, Require 1 wBTC". Posts to Book.
2.  **Bob (Maker B):** Signs SCI "Spend 1 wBTC, Require 10 MOB". Posts to Book.
3.  **The Matcher:**
    *   Monitors the book.
    *   Identifies that A and B match.
    *   **Constructs a Transaction:**
        *   *Input 1:* Alice's SCI.
        *   *Input 2:* Bob's SCI.
        *   *Output 1:* 1 wBTC to Alice (Satisfies A).
        *   *Output 2:* 10 MOB to Bob (Satisfies B).
        *   *Input 3 (Fee):* Matcher's own small input (to pay network fees).
        *   **Submission:** The Matcher signs their own input and broadcasts the Tx.
4.  **Result:** Atomic Swap completed without Alice or Bob being online at that moment.

### Requirements for "Solver" Model
*   **Fees:** The Matcher pays the gas fees. They might require a "spread" (e.g., Alice wanted 1.0 wBTC, Bob offered 1.01 wBTC, Matcher keeps 0.01) to cover costs.
*   **Partial Fills:** The Matcher can perform complex geometry.
    *   Alice sells 10 MOB.
    *   Bob buys 5 MOB.
    *   Charlie buys 5 MOB.
    *   *Tx:* [Input Alice] -> [Output Bob, Output Charlie]. **One Transaction.**
*   **Trust:** Completely Trustless. The Matcher *cannot* steal funds because they cannot satisfy the SCI rules (Inputs A & B) without creating the specific outputs A & B demanded. If the Matcher tries to redirect funds to themselves, the SCI signatures become invalid.

### Architecture Update
*   **Frontend:** Users purely sign "Intents" (SCIs). They don't need to "Take" liquidty.
*   **Backend:** Needs a **Matching Engine** loop (`while True: find_matches()`) running in Python/Rust.

## 7. Implementation Plans (Python App Enhancement)

The plan would fork `antelope` and perform the following evolution:

### Phase 1: Stripping & Base
1.  **Remove DTR:** Delete `app/services/dtr`, `app/models/dtr`, and routes. Remove dependencies on Fiat/KYC.
2.  **Refactor Models:**
    *   Convert `Swap` (User-Dealer) to `Order` (Maker-Taker).
    *   Schema: `Order` table needs fields for: `sci_blob` (binary), `maker_signature`, `price_ratio`, `min_fill_amount`.

### Phase 2: Python Backend (The Discovery Service)
1.  **API Endpoint `POST /orders`:**
    *   Accepts the cryptographic blob.
    *   Parses it (using MobileCoin Python bindings or Rust FFI).
    *   Validates signatures ~~(light verification)~~.
    *   **Critical:** Checks `mobilecoind` to ensure the input UTXO is actually unspent.
2.  **API Endpoint `GET /orderbook`:**
    *   Returns list of valid orders.
    *   Filters by Pair (e.g., MOB/wBTC).
    *   Sorts by Price.
3.  **Watcher Service:**
    *   A background worker (like `antelope`'s existing block processor) that monitors the ledger.
    *   If an SCI's input is spent on-chain, delete it from the Order DB.

### Phase 3: Frontend (React)
1.  **WASM Integration:** The complex cryptography (Creating partial fill proofs) likely needs Rust compiled to WASM, as JS crypto is slow/insecure for Ring Signatures.
2.  **Flow:**
    *   User clicks "Buy".
    *   App fetches Order Book.
    *   App selects best orders (Client-side matching).
    *   App constructs the tx.
    *   User signs.

## 8. Frontend Authorization & Signatures

Since this is a non-custodial DEX, the **Frontend** bears the responsibility of all security operations.

### Key Management
The app does not use a "Login" in the traditional sense (Username/Password). It uses **Keys**.
1.  **Private Spend Key:** Needed to sign transactions (send money/create orders). **NEVER leaves the client.**
2.  **Private View Key:** Needed to scan Fog/Ledger for incoming money.

### Workflow Requirements

| Action | Key Required | Logic Location | Description |
| :--- | :--- | :--- | :--- |
| **Balance Check** | View Key | Client + Fog | Client queries Fog: "Do I have new outputs?" Fog returns encrypted blobs. Client decrypts locally to show MOB/wBTC balance. |
| **Create Order** | Spend Key | Client (WASM) | 1. Select unspent Output (UTXO).<br>2. Generate Ring Signature (mixing real output with decoys).<br>3. Sign the SCI blob enforcing the "Contingency".<br>4. Send Blob to API. |
| **Fill Order** | Spend Key | Client (WASM) | 1. Fetch Maker's SCI.<br>2. Select Taker's own Inputs.<br>3. Construct Tx (Combine SCI + Taker Inputs).<br>4. Generate Range Proofs (proving values balance without revealing them).<br>5. Sign Taker inputs.<br>6. Submit to Network. |

### Implementation Note
It would likely be necessary to compile the Rust MobileCoin SDK (specifically `mc-transaction-core`) to WebAssembly (WASM) to perform these heavy cryptographic operations in the browser. JavaScript alone involves too much risk (timing attacks, RNG issues) and performance overhead for Ring Signatures and Bulletproofs (Range Proofs).

## 9. Specific Trading Scenarios

All pairs below assume "wAsset" model (Wrapped assets on MobileCoin), which provides the smoothest UX.

### A. MOB - wBTC (Wrapped Bitcoin)
*   **Context:** User wants to sell Volatile Asset for Privacy Coin.
*   **Maker:** Offers 10,000 MOB. Wants 1 wBTC.
*   **Swap:** Atomic on MobileCoin.
*   **Bridge:** Critical dependency. User trusts Bridge to redeem wBTC for real BTC later.

### B. MOB - wETH (Wrapped Ether)
*   **Context:** Similar to BTC.
*   **Differentiation:** High frequency of small trades common in ETH ecosystem. Partial Fills are essential here.

### C. MOB - wUSDC / wUSDT (Stablecoins)
*   **Context:** "Parking" funds / Store of Value.
*   **Importance:** This is the highest volume pair for most CEXs.
*   **Scenario:**
    *   Alice fears volatility. She swaps 1000 MOB -> 500 wUSDC.
    *   This transaction is encrypted. Unlike Ethereum (where "Alice sent 500 USDC" is public), here it is an obfuscated MobileCoin Tx.
    *   *Result:* Private Stablecoin usage.

## 10. Asset Integration Paths

Three distinct architectural paths have been identified for handling external assets (BTC, ETH, etc.). Each has different tradeoffs regarding Custody, Regulatory Risk, and User Experience.

### [Path 1: Centralized Bridge (The Vault)](./path_1_centralized_bridge.md)
*   **Model:** Custodial Hot Wallet.
*   **Pros:** Fastest UX, Simplest Code.
*   **Cons:** High Regulatory Risk, Single Point of Failure.

### [Path 2: Federated Bridge (The Consortium)](./path_2_federated_bridge.md)
*   **Model:** Multi-Sig / Threshold Signatures (TSS).
*   **Pros:** Distributed Trust, Resilient.
*   **Cons:** Complex Setup, still requires trust in the Federation.

### [Path 3: Cross-Chain Atomic Swaps (The Oracle)](./path_3_atomic_swaps.md)
*   **Model:** Pure Non-Custodial (Conditional Payments).
*   **Pros:** Zero Custody, Zero Trust in Bridge.
*   **Cons:** Slow Settlement (Block times), High User Friction.

**Suggestion:** The proposed approach is to proceed with the **DEX Core** implementation (Phase 1) which is required for all paths. The specific Asset Path can be selected later, but the code structure below assumes an `wAsset` model (Path 1 or 2) for the initial prototype.

---

## 11. MobileCoin Foundation GitHub Ecosystem

### 1.1 Repository Inventory (38 public repos under `mobilecoinfoundation`)

| Repo | Relevance to DEX | Description |
|------|-------------------|-------------|
| **mobilecoin** | **CRITICAL** | Main repo: consensus, fog, mobilecoind, watcher, transaction builder, SCI. 2,709 commits, v7.1.0 (Oct 2025) |
| **mcips** | **CRITICAL** | All MobileCoin Improvement Proposals - the protocol specifications |
| **attestation** | HIGH | Remote attestation primitives (SGX) |
| **sgx** | HIGH | SGX support libraries |
| **protobufs** | HIGH | Protobuf definitions for gRPC APIs |
| **serial** | MEDIUM | Serialization library used throughout MC stack |
| **from-random** | LOW | Random value generation |
| **mc-oblivious** | MEDIUM | Oblivious data structures (for Fog) |
| **rand** | LOW | RNG utilities |
| **curve25519-dalek** | MEDIUM | Forked elliptic curve library |
| **x25519-dalek** | MEDIUM | Key exchange |
| **bulletproofs** | MEDIUM | Range proof library |
| **schnorrkel** | MEDIUM | Schnorr signature library |
| **build-rs** | LOW | Build tooling |
| **sgx-std** | LOW | SGX standard library |
| **sgx-sigstruct** | LOW | SGX signing structures |
| **mc-config** | LOW | Configuration utilities |
| **compliance** | LOW | Compliance tooling |
| **cookiecutters** | LOW | Project templates |
| **actions** | LOW | GitHub Actions |

### 1.2 Full-Service Wallet (`mobilecoinofficial/full-service`)

**This is a critical discovery** - a full JSONRPC wallet service for MobileCoin that our DEX should integrate with or learn from.

- **Repo**: `github.com/mobilecoinofficial/full-service` (826 commits, latest v2.10.8)
- **Purpose**: Ledger syncing, account management, transaction building, UTXO tracking
- **API**: JSONRPC v2 over HTTP (port 9090)
- **Storage**: SQLite wallet database + LMDB ledger database
- **Docker**: Pre-configured container images for testnet/mainnet

#### Key JSONRPC Methods (from `request.rs`)

```
create_account               - Create a new wallet account
build_and_submit_transaction - Build and immediately submit a transaction
build_transaction            - Build a transaction without submitting
build_tx_blueprint           - Build a transaction blueprint for offline signing
build_unsigned_burn_transaction - Build unsigned burn transaction
assign_address_for_account   - Generate new subaddresses
```

#### SCI Support in Full-Service

Full-Service has a dedicated `SignedContingentInputService` trait (in `service/signed_contingent_input.rs`):

```rust
pub trait SignedContingentInputService {
    /// Validate a proof of reserve signed contingent input.
    /// Ensures the SCI is valid (valid signature), has ring size of 1,
    /// is unspendable, and contains a real TxOut in the ledger.
    /// Note: Does NOT check if the TxOut key image appears in the ledger,
    /// so the TxOut may already be spent.
    fn validate_proof_of_reserve_sci(&self, sci_proto: &str)
        -> Result<ValidateProofOfReserveSciResult, ...>;
}
```

Validation results:
- `Valid { tx_out_public_key, key_image, amount }` - SCI is valid proof of reserve
- `InvalidSci { error }` - Signature validation failed
- `NotProofOfReserveSci { error }` - Not a proper proof of reserve
- `TxOutNotFoundInLedger { tx_out_public_key }` - TxOut not in ledger
- `TxOutMismatch { tx_out_public_key }` - TxOut doesn't match ledger

#### Hardware Wallet / Signer Module

Full-Service includes a separate `signer/` module for offline transaction signing:
- `sign_tx_with_mnemonic()` / `sign_tx_with_bip39_entropy()` - Sign with mnemonic
- `sign_tx_blueprint_with_mnemonic()` - Sign blueprints for hardware wallets
- SLIP-0010 key derivation support
- `SyncTxos` / `GetAccount` / `SignTx` operations

**Implication for DEX**: Full-Service could serve as the backend wallet service instead of raw `mobilecoind`. It provides a cleaner JSONRPC API and already handles SCI validation.

### 1.3 DEQS (Decentralized Exchange Quote Service) - Published Reference Implementation

**Repository**: [`mobilecoinofficial/deqs`](https://github.com/mobilecoinofficial/deqs)

The DEQS is a fully implemented decentralized quoting service for storing, distributing, and tracking the lifecycle of SCI-based "quotes." It is the reference architecture for exactly the kind of order book our DEX needs.

#### Architecture Overview

The DEQS is organized as a **decentralized peer-to-peer network** for distributing signed quotes. A "quote" wraps an SCI with metadata (timestamp, QuoteId, trading pair).

**Key constraint**: The DEQS only accepts SCIs with:
- Exactly **one fractional output** ("partial fill" quotes), OR
- Exactly **one required output** ("all-or-nothing" quotes)

This scopes it to single-pair trades and avoids complex multi-currency swap offers.

#### Core Data Types (from `quote-book/api/`)

```rust
/// A single trading pair
pub struct Pair {
    pub base_token_id: TokenId,    // Token being offered "for sale"
    pub counter_token_id: TokenId, // Token that must be paid
}

/// Unique identifier for a quote (derived from SCI digest)
pub struct QuoteId(pub [u8; 32]);

/// A single "quote" in the book - wraps an SCI with metadata
pub struct Quote {
    sci: SignedContingentInput,
    id: QuoteId,
    pair: Pair,
    base_range: RangeInclusive<u64>,   // Min..=Max base tokens obtainable
    max_counter_tokens: u64,           // Counter tokens needed for max fill
    timestamp: u64,                    // Nanoseconds since epoch
}
```

#### QuoteBook Trait (the order book interface)

```rust
pub trait QuoteBook: Clone + Send + Sync + 'static {
    fn add_sci(&self, sci: SignedContingentInput, timestamp: Option<u64>) -> Result<Quote, Error>;
    fn add_quote(&self, quote: &Quote) -> Result<(), Error>;
    fn remove_quote_by_id(&self, id: &QuoteId) -> Result<Quote, Error>;
    fn remove_quotes_by_tombstone_block(&self, current_block: u64) -> Result<Vec<Quote>, Error>;
    fn get_quotes(&self, pair: &Pair, base_range: impl RangeBounds<u64>, limit: usize) -> Result<Vec<Quote>, Error>;
    fn get_quote_ids(&self, pair: &Pair) -> Result<Vec<QuoteId>, Error>;
}
```

#### Storage Backends
- **InMemoryQuoteBook**: For testing
- **SqliteQuoteBook**: Production-grade with diesel ORM (schema: `id`, `sci_protobuf`, `pair`, `base_range_min/max`, `max_counter_tokens`, `timestamp`, `tombstone_block`)
- **SynchronizedQuoteBook**: Wraps any QuoteBook with automatic **key image monitoring** - validates SCI rings against the ledger and removes quotes when their key images are spent

#### gRPC Service API

```protobuf
service DeqsClientApi {
    rpc SubmitQuotes(SubmitQuotesRequest) returns (SubmitQuotesResponse);
    rpc GetQuotes(GetQuotesRequest) returns (GetQuotesResponse);
    rpc LiveUpdates(LiveUpdatesRequest) returns (stream LiveUpdate);
}
```

- **SubmitQuotes**: Batch submit up to 30 SCIs at once; returns per-quote status codes (`CREATED`, `UNSUPPORTED_SCI`, etc.)
- **GetQuotes**: Filter by pair, base amount range; returns sorted quotes
- **LiveUpdates**: Server-streaming for real-time quote additions/removals

URI scheme: `deqs://host:443` (secure) / `insecure-deqs://host:7000` (insecure)

#### P2P Quote Distribution

DEQS servers form a **P2P network** using `postage::broadcast` message bus:
- `Msg::SciQuoteAdded(Quote)` - propagated when a new quote is accepted
- `Msg::SciQuoteRemoved(Quote)` - propagated when a quote is consumed/expired
- Servers bootstrap from known peers and sync quote books

#### Liquidity Bot

The repo includes a `liquidity-bot/` crate that:
- Watches a Full-Service wallet for incoming TxOuts
- Automatically generates SCIs and submits them to the DEQS
- Tracks `PendingTxOut` → `ListedTxOut` lifecycle
- Auto-refreshes quotes every 600 seconds
- Detects fulfilled SCIs and manages re-listing
- Configurable per trading pair with decimal price ratios

#### Dust Protection

The server enforces minimum quote sizes via a configurable `quote_minimum_map` per token ID, rejecting SCIs below the threshold with `QuoteStatusCode::UNSUPPORTED_SCI`.

#### Validation Pipeline

1. SCI signature validation (`sci.validate()`)
2. Ring element validation (SynchronizedQuoteBook checks TxOuts exist in ledger)
3. Dust check (minimum quote size)
4. Duplicate detection (QuoteId uniqueness)
5. Key image monitoring (background thread removes quotes with spent key images)

**Implication**: The DEQS is a complete reference implementation. Our DEX should either:
1. **Fork the DEQS** and extend it with our bridge + matching logic, OR
2. **Run the DEQS as-is** and build our DEX frontend + bridge as separate services that connect to it via gRPC

### 1.4 MobileCoin Watcher Component

The `watcher/` module in the main mobilecoin repo provides a reference pattern for blockchain monitoring:

**Architecture**:
- `Watcher` struct: Watches multiple consensus validators, collects block signatures
- `WatcherDB`: LMDB-backed storage for block signatures, attestation evidence, sync status
- `WatcherSyncThread`: Background thread that polls and syncs blocks
- `ReqwestTransactionsFetcher`: HTTP-based block fetching from S3-like URLs

**Key Design Patterns** (applicable to our BTC/ETH watchers):
- Per-URL fetcher with caching mechanism
- Parallel block fetching across multiple sources
- Last-synced tracking per source URL
- Prometheus metrics for sync status
- `MAX_BLOCKS_PER_SYNC_ITERATION = 1000` for throttling
- `poll_interval` configuration for sync frequency
- Graceful shutdown via `AtomicBool` stop flag

**Sync pattern from `mobilecoind/src/sync.rs`**:
- Monitor-based scanning (each monitor = one account watching the ledger)
- Parallel UTXO matching using `rayon::par_iter`
- Crossbeam channel for worker thread communication
- Chunk-based processing to prevent starvation

---

## 12. MCIP Deep Dive - Protocols Critical to DEX

### 2.1 MCIP 31: Signed Contingent Inputs (the Foundation)

**Full Specification**: `mobilecoinfoundation/mcips/text/0031-transactions-with-contingent-inputs.md`

Key protocol details not captured in our existing docs:

#### InputRules Protobuf Schema
```protobuf
message InputRules {
    repeated external.TxOut required_outputs = 1;
    fixed64 max_tombstone_block = 2;
}
```

#### SignedContingentInput Protobuf Schema
```protobuf
message SignedContingentInput {
    uint32 block_version = 1;
    TxIn input = 2;
    RingMLSAG ring_signature = 3;
    UnmaskedAmount unmasked_pseudo_output = 4;
    repeated UnmaskedAmount unmasked_required_outputs = 5;
    repeated fixed64 tx_out_global_indices = 6;
}
```

#### UnmaskedAmount
```protobuf
message UnmaskedAmount {
    fixed64 value = 1;
    fixed32 token_id = 2;
    CompressedRistretto blinding_factor = 3;
}
```

#### Validation Steps
1. Check that each `unmasked_required_output` corresponds to the commitment in `required_outputs`
2. Build the `pseudo_output` from `unmasked_pseudo_output`
3. Confirm that `ring_signature` actually signs it
4. The message is the hash of `input` (NOT the extended message digest)
5. At least one input in any Tx must NOT have pre-signed rules (prevents malleability)

#### Key Privacy Properties
- SCI does not reveal the originator's public address
- SCI does not reveal which TxOut in the ledger is truly owned
- SCI DOES reveal token_id and value (unavoidable for counterparty to build balanced tx)
- No permanent record of trade proposal on blockchain (only if fulfilled)
- No MEV possible (consensus nodes never see the proposal)
- No fee for proposing a trade (only for executing)
- Counterparty is anonymous - originator only knows trade was executed

#### SCI Without Gas
A key use case: users can create SCIs even with zero MOB balance. The SCI can include change back to themselves, and the counterparty pays the gas fee when fulfilling. This is a significant UX advantage over Ethereum-based DEXes.

### 2.2 MCIP 42: Partial Fill Rules (Extended from MCIP 31)

**Full Specification**: `mobilecoinfoundation/mcips/text/0042-partial-fill-rules.md`

Key details:

#### Partial Fill Specification in InputRules
- **Partial fill outputs**: List of TxOut's that may be partially filled
- **Partial fill change output**: Sends leftover value back to originator
- **Minimum fill value**: Prevents griefing with dust amounts
- **Implicit partial fill fraction**: Fraction of max volume actually transacted

#### Critical Limitation
> "In a traditional exchange, limit orders that are partially filled remain on the books until being totally filled... In this proposal, that would not work, because as soon as the first counterparty matches the order, the key image underlying the SCI is burned."

**Implication**: After partial fill, the originator must create and broadcast a NEW SCI for remaining quantity. The DEX must handle this re-listing automatically.

#### Amount Shared Secret (New in Block Version 3)
MCIP 42 introduces a new amount derivation scheme where amounts in partial fill transactions are NOT secret from the consensus enclave. This is acceptable because:
> "Both the originator and the counterparty are anonymous, but not that the amounts being offered to transact are secret."

### 2.3 MCIP 53: Minting to Fog Addresses (**Critical for Bridge**)

**Full text**: `mobilecoinfoundation/mcips/text/0053-minting-to-fog-addresses.md`

> **"The main motivation is to allow creating a non-custodial cross-chain bridge with no humans in the loop that can be used from a phone."**

The `MintTx` now contains an optional fog hint. If provided, the consensus enclave uses it with the resulting `TxOut`.

**Implication**: This MCIP is the foundation for our bridge design. It means:
- Bridge can mint wrapped tokens (wBTC, wETH, wUSDC, wUSDT) directly to Fog addresses
- Mobile users with Fog-enabled wallets can receive bridged tokens
- No intermediate step of minting to a non-Fog address and then transferring

### 2.4 MCIP 37: Minting (Token Creation)

Establishes the `MintTx` and `MintConfigTx` protocol:
- **MintConfigTx**: Configures which keys are authorized to mint a token, with M-of-N multisig
- **MintTx**: Actually mints tokens, requiring the configured multisig signatures
- Each MintTx includes nonce (replay protection) and tombstone block (TTL)
- All minting transactions are on-chain and auditable

### 2.5 MCIP 55: Nested Multi-Sigs (**Critical for Federated Bridge**)

Extends `SignerSet` to support nesting, enabling hierarchical multi-sigs:

> "When specifying the required signers for some arbitrary token, we might say that we want two entities to authorize a minting transaction:  
> 1. The MobileCoin foundation  
> 2. A liquidity provider that holds the backing asset  
>  
> Right now, there is no good way to specify this... Following this proposal, it will become possible to specify such signer sets, where each signer can be either an individual key, or another signer set."

**Implication for Path 2 (Federated Bridge)**: This enables the exact signing scheme we need:
- Bridge operator organization → M-of-N internal keys
- MobileCoin Foundation → M-of-N internal keys  
- Combined: Both organizations (or threshold of them) must agree to mint

### 2.6 MCIP 57: Update Mixin Uniqueness Rules for SCIs

Relaxes the `DuplicateRingElements` validation when SCIs are present:

**Problem**: Alice creates an SCI with a ring containing Bob's TxOut as a mixin. Bob tries to use the SCI in a transaction with his own TxOut - rejected for duplicate ring elements.

**Solution**: When SCIs are present, the rule is relaxed to only check uniqueness within each individual ring, not across all rings in the transaction.

**Implication**: This is important for production DEX operation. Without MCIP 57, a significant percentage of order fills would fail randomly.

### 2.7 Block Version Feature Registry

| Feature | Block Version | MCIP |
|---------|:------------:|:----:|
| Encrypted Memos | 1 | #3 |
| Confidential Tokens | 2 | #25 |
| Mint Transactions | 2 | #37 |
| Sorted TxOuts | 3 | #34 |
| Mixed Transactions | 3 | #31 |
| Signed Input Rules | 3 | #31 |
| Partial Fill Rules | 3 | #42 |
| Block Metadata | 3 | #43 |
| Nested Multi-Sigs | 3 | #55 |

**Current Mainnet**: Block version 3 is required for all DEX functionality (SCIs, partial fills).

---

## 13. SCI Implementation Details (from Rust Source Code)

### 3.1 SignedContingentInputBuilder Pattern

From `transaction/builder/src/signed_contingent_input_builder.rs`:

```rust
let mut sci_builder = SignedContingentInputBuilder::new(
    block_version,
    input_credentials,    // Ring + proofs + real index + key
    fog_resolver,         // For Fog output construction
    EmptyMemoBuilder,     // Memo strategy
).unwrap();

// For full-fill: specify EXACT output required
sci_builder.add_required_output(
    Amount::new(value, token_id),
    &recipient_public_address,
    &mut rng,
).unwrap();

// For partial-fill: specify output that can be partially filled
sci_builder.add_partial_fill_output(
    Amount::new(max_value, token_id),
    &recipient_public_address,
    &mut rng,
).unwrap();

// Set partial fill change output (goes back to originator)
sci_builder.add_partial_fill_change_output(
    Amount::new(max_value, token_id),
    &change_public_address,
    &mut rng,
).unwrap();

// Anti-griefing: minimum fill value
sci_builder.set_min_partial_fill_value(min_value).unwrap();

// TTL for the order
sci_builder.set_tombstone_block(current_block + MAX_ORDER_LIFETIME);

// Sign the SCI
let sci = sci_builder.build(&ring_signer, &mut rng).unwrap();
```

### 3.2 Consuming an SCI (TransactionBuilder)

```rust
let mut tx_builder = TransactionBuilder::new(
    block_version,
    Amount::new(Mob::MINIMUM_FEE, Mob::ID),
    fog_resolver,
).unwrap();

// Add your own input (to pay for the other side of the swap + fees)
tx_builder.add_input(my_input_credentials);

// Add the pre-signed SCI
tx_builder.add_presigned_input(sci).unwrap();

// Add your payment output (what you're giving)
tx_builder.add_output(payment_amount, &originator_address, &mut rng).unwrap();

// Build and sign
let tx = tx_builder.build(&ring_signer, &mut rng).unwrap();
```

### 3.3 Fog Sample Paykit - Swap Methods

From `fog/sample-paykit/src/client.rs`:

```rust
/// Build a swap proposal (creates an SCI)
pub fn build_swap_proposal(
    &mut self,
    input: OwnedTxOut,
    offering_token_id: TokenId,
    offering_value: u64,
    requesting_token_id: TokenId,
    requesting_value: u64,
    min_fill_value: u64,
    tombstone_block: u64,
) -> Result<SignedContingentInput, Error>

/// Build a transaction that fulfills an SCI
pub fn build_swap_transaction(
    &mut self,
    sci: &SignedContingentInput,
    inputs: &[OwnedTxOut],
    fee: Amount,
    tombstone_block: u64,
) -> Result<Tx, Error>
```

### 3.4 mobilecoind gRPC - SCI Generation

From `mobilecoind/src/payments.rs`, `generate_swap_impl()`:
- Takes an input UTXO, offering/requesting amounts
- Builds SCI with partial fill support
- Returns the SCI "in the form accepted by the deqs"
- Uses the service's own ring sampling and Fog resolution

---

## 14. External Chain Monitoring Infrastructure

### 4.1 Bitcoin Monitoring

#### Option A: Mempool.space (Self-Hosted or Public API)

**Recommendation: PRIMARY for BTC monitoring**

- **Open Source**: Full stack can be self-hosted
- **REST API**: Comprehensive endpoints for blocks, transactions, addresses, fees
- **WebSocket API**: Real-time updates for transactions and blocks
- **Backend**: Built on `electrs` (Rust Electrum server)
- **Privacy**: Self-hosting means no third-party data leakage

Key API endpoints for bridge deposit monitoring:
```
GET /api/address/:address/txs          - Get address transactions
GET /api/address/:address/utxo         - Get address UTXOs
GET /api/tx/:txid                      - Get transaction details
GET /api/tx/:txid/status               - Get confirmation status
WS  { "track-address": ":address" }    - Real-time address monitoring
GET /api/blocks/tip/height             - Current block height
GET /api/v1/fees/recommended           - Fee estimation
```

Self-hosting requirements:
- Full Bitcoin node (bitcoind ~600GB)
- electrs (Rust, ~30GB index)
- mempool frontend (Node.js)

#### Option B: Blockstream Explorer API

- **Open Source**: `github.com/Blockstream/esplora`
- **Bitcoin-first**: No altcoin noise
- **Privacy features**: Tor support, minimal logging
- **API**: REST-based, compatible endpoints with mempool.space

#### Option C: Alchemy (Managed Service)

- Supports Bitcoin via enhanced APIs
- Free tier: 30M CUs/month
- Managed infrastructure, no node maintenance

**Proposed Architecture**: Self-hosted Mempool.space for privacy + Alchemy as fallback.

### 4.2 Ethereum + ERC-20 Monitoring

#### Provider Comparison (2025-2026 Data)

| Provider | Pricing Model | Free Tier | Avg Latency | Observed Uptime |
|----------|:------------:|:---------:|:-----------:|:---------------:|
| **Alchemy** | Compute Units | 30M CUs/mo (~1.2M calls) | 207ms | ~99.7% |
| **QuickNode** | Credits/Tier | None (starts $49/mo) | 86ms | ~99.85% |
| **Infura** | Requests/day | 100K req/day (3M/mo) | ~150ms | ~99.5% |

#### Cost Analysis for DEX Use Case

For bridge deposit monitoring (~5M requests/month with 20% `eth_getLogs`):
- **Alchemy**: ~$180/month (CU variability adds 30% buffer)
- **QuickNode**: $249/month (predictable, fastest)
- **Infura**: $225/month (request caps can throttle)

**Hidden costs**:
- `eth_getLogs` is expensive on Alchemy: 75 CUs per call (can spike with large block ranges)
- Archive node access often requires separate pricing
- Multi-chain support counts separately

#### ERC-20 Deposit Detection Pattern

**Contract Addresses (Ethereum Mainnet)**:
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

**Transfer Event Signature**:
```solidity
event Transfer(address indexed from, address indexed to, uint256 value)
// Topic[0]: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
```

**Monitoring Approach**:

```python
# eth_getLogs filter for deposit detection
filter_params = {
    "address": USDC_CONTRACT_ADDRESS,          # or USDT
    "topics": [
        TRANSFER_EVENT_TOPIC,                  # Transfer event
        None,                                  # Any sender
        encode_address(bridge_deposit_address)  # Our bridge address
    ],
    "fromBlock": last_processed_block,
    "toBlock": "latest"
}
```

**Real-time via WebSocket**:
```json
{
    "jsonrpc": "2.0",
    "method": "eth_subscribe",
    "params": ["logs", {
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "topics": ["0xddf252ad..."]
    }]
}
```

**Confirmation Requirements**:
- USDC/USDT (Ethereum): 12-20 confirmations (~3-5 minutes)
- Must handle chain reorganizations (reorgs up to 12 blocks possible)
- After reorg, deposits must be re-evaluated

**Proposed Architecture**:
1. **Primary**: Alchemy WebSocket subscription for real-time Transfer events
2. **Fallback**: QuickNode for redundancy
3. **Verification**: Self-hosted Geth/Erigon node for independent verification of significant deposits
4. Multi-provider strategy prevents single point of failure

### 4.3 Native Bitcoin Monitoring (UTXO-based)

Unlike ERC-20 events, Bitcoin deposit detection is UTXO-based:

```
1. Generate unique deposit address per user (HD wallet derivation)
2. Watch address for incoming transactions (via mempool.space WS)
3. Track confirmation count (6 confirmations standard for BTC)
4. Once confirmed, trigger bridge mint on MobileCoin side
```

**Key Differences from Ethereum**:
- No events/logs - must watch address UTXOs directly
- Longer confirmation time (6 blocks ≈ 60 minutes)
- Replace-By-Fee (RBF) can invalidate unconfirmed transactions
- Must track UTXO set, not just events

---

## 15. Architectural Insights for DEX Design

### 5.1 Full-Service vs mobilecoind - Which to Use?

| Feature | mobilecoind | Full-Service |
|---------|:-----------:|:------------:|
| API | gRPC (protobuf) | JSONRPC (HTTP) |
| SCI Creation | `generate_swap_impl()` | Not yet (planned?) |
| SCI Validation | No | Yes (proof of reserve) |
| Account Management | Monitors (subaddress-based) | Full accounts with names |
| Hardware Wallet | No | Yes (signer module) |
| Docker | No official image | Official images for testnet/mainnet |
| UTXO Management | Basic | Advanced (with status tracking) |
| Watcher Integration | Built-in optional | Separate (uses WatcherDB) |

**Recommendation**: Start with **Full-Service** as the primary MobileCoin backend for the DEX:
- Cleaner API (JSONRPC over HTTP = easier to integrate from Python/FastAPI backend)
- Built-in SCI validation
- Better account management
- Docker-ready deployment
- Active development with hardware wallet support

Use **mobilecoind** features that Full-Service lacks (e.g., `generate_swap_impl()` for SCI creation) by incorporating the Rust library directly or via the JSONRPC API when it adds SCI creation support.

### 5.2 Order Lifecycle (Corrected with Source Code Insights)

Based on the actual Rust code, the order lifecycle should be:

```
1. User selects UTXO to trade (via Full-Service account management)
2. Client builds SCI using SignedContingentInputBuilder:
   - add_partial_fill_output() for the amount they want to receive
   - add_partial_fill_change_output() for change back to themselves
   - set_min_partial_fill_value() to prevent griefing
   - set_tombstone_block() for order expiry
   - build() signs the SCI
3. Client submits SCI to DEX order book service (our DEQS equivalent)
4. DEX stores SCI, extracts key_image for tracking
5. Counterparty browses order book, selects order
6. Counterparty's client calls TransactionBuilder:
   - add_input() with their own UTXO
   - add_presigned_input(sci) with the SCI
   - add_output() for payment to originator
   - build() creates balanced transaction
7. Counterparty submits transaction to MobileCoin network
8. Once confirmed, DEX detects key_image burn → marks order filled
9. If partial fill: originator creates new SCI for remainder → goto step 3
```

### 5.3 DEQS Integration Strategy

The public DEQS at [`mobilecoinofficial/deqs`](https://github.com/mobilecoinofficial/deqs) already implements core order book functionality. Our DEX strategy:

**Option A - Fork & Extend DEQS** (Recommended):
1. Fork `mobilecoinofficial/deqs` as our quote service backbone
2. The DEQS already provides: Order storage, SCI validation, key image monitoring, tombstone expiry, P2P quote distribution, gRPC API, dust protection
3. We extend with: Bridge integration, solver/matcher engine, frontend, cross-chain watcher services

**Option B - Build Separate DEX + Connect to DEQS**:
1. Run DEQS as a standalone service via Docker
2. Build our DEX frontend + bridge as separate services connecting via gRPC (`deqs://` URI)
3. Use the `LiveUpdates` streaming RPC for real-time order book updates

**What the DEQS already handles** (no need to rebuild):
- `QuoteBook` trait with `add_sci()`, `get_quotes()`, `remove_quote_by_id()`
- `SynchronizedQuoteBook` with automatic key image monitoring against the ledger
- `SqliteQuoteBook` for persistent storage
- gRPC service with `SubmitQuotes`, `GetQuotes`, `LiveUpdates`
- P2P quote propagation between DEQS nodes
- Dust protection via configurable minimums
- Tombstone block expiry

**What we still need to build on top**:
1. **Active Solver/Matcher**: DEQS is passive (stores/distributes quotes). We need a matching engine that combines crossing quotes into transactions
2. **Bridge Services**: BTC/ETH/ERC-20 deposit watching + federated minting
3. **Frontend**: React + WASM client for key management, SCI creation, order visualization
4. **Liquidity Management**: Auto-relisting after partial fills (reference: DEQS `liquidity-bot/` crate)

### 5.4 Bridge Minting Architecture (Using MCIP 53 + MCIP 55)

The bridge should use:
- **MCIP 53** (Minting to Fog Addresses): Mint wrapped tokens directly to user's Fog-enabled address
- **MCIP 37** (Minting): Configure authorized signers for each wrapped token
- **MCIP 55** (Nested Multi-Sigs): Hierarchical signing for federated bridge operators

```
Wrapped Token Configuration:
  token_id: e.g., 2 (wBTC), 3 (wETH), 4 (wUSDC), 5 (wUSDT)
  signer_set:
    threshold: 2-of-2
    signers:
      - BridgeOperator: 3-of-5 internal keys
      - MobileCoinFoundation: 2-of-3 internal keys
```

Mint flow:
```
1. User deposits BTC/ETH/USDC/USDT to bridge address
2. BTC/ETH watcher confirms deposit (6/12+ confirmations)
3. Bridge generates MintTx with user's Fog hint
4. Bridge operator keys sign MintTx (threshold met)
5. MintTx submitted to MobileCoin consensus
6. Wrapped tokens appear in user's Fog-enabled wallet
```

---

## 16. Key Gaps Still Remaining

### 6.1 Information Gaps

1. **WASM compilation path** - How exactly to compile `mc-transaction-builder` to WASM for browser
2. **Fog key registration process** - How a new user registers their view key with Fog ingest
3. **Token creation process** - Exact steps to create and configure new token IDs on MobileCoin mainnet
4. **DEQS deployment** - How to run the DEQS in production/testnet environments (Docker, configuration)

### 6.2 Technical Risks Identified
1. **SCI re-listing after partial fill**: The originator must be online to create new SCIs. If they go offline after a partial fill, the remaining liquidity is lost until they return.
2. **Ring element conflicts (MCIP 57)**: Even with the fix, there's a non-zero probability of conflicts. The DEX may need retry logic.
3. **Tombstone block management**: If blocks are produced faster than expected, orders could expire prematurely. Need to use conservative tombstone values.
4. **Bridge custody risk**: Even with multi-sig, the bridge holds real assets. A compromise of threshold keys = loss of all bridged assets.

### 6.3 Recommended Next Steps
1. Set up a MobileCoin testnet instance with Full-Service for development
2. Create a proof-of-concept SCI creation + consumption flow
3. Design the DEQS/order book schema and API
4. Set up Mempool.space (self-hosted) for BTC monitoring in development
5. Get an Alchemy API key for ETH/ERC-20 monitoring in development
6. Investigate the WASM compilation path for `mc-transaction-builder`
7. Contact MobileCoin Foundation about token creation process for wrapped assets

---

## 17. Reference Links

### GitHub Repositories
- Main: https://github.com/mobilecoinfoundation/mobilecoin
- MCIPs: https://github.com/mobilecoinfoundation/mcips
- Full-Service: https://github.com/mobilecoinofficial/full-service
- DEQS: https://github.com/mobilecoinofficial/deqs
- Protobufs: https://github.com/mobilecoinfoundation/protobufs

### Key Source Files
- SCI Builder: `mobilecoin/transaction/builder/src/signed_contingent_input_builder.rs`
- SCI Validation: `full-service/full-service/src/service/signed_contingent_input.rs`
- Fog Paykit (swap methods): `mobilecoin/fog/sample-paykit/src/client.rs`
- Watcher: `mobilecoin/watcher/src/watcher.rs`
- mobilecoind Sync: `mobilecoin/mobilecoind/src/sync.rs`
- mobilecoind Payments (SCI): `mobilecoin/mobilecoind/src/payments.rs`

### MCIPs
- MCIP 31 (SCI): `mcips/text/0031-transactions-with-contingent-inputs.md`
- MCIP 42 (Partial Fills): `mcips/text/0042-partial-fill-rules.md`
- MCIP 53 (Mint to Fog): `mcips/text/0053-minting-to-fog-addresses.md`
- MCIP 55 (Nested Multi-Sigs): `mcips/text/0055-nested-multi-sigs.md`
- MCIP 57 (Mixin Uniqueness): `mcips/text/0057-update-mixin-uniqueness-rules-for-scis.md`
- Block Version Feature Registry: `mcips/registries/block-version-features.md`

### Infrastructure
- Mempool.space API: https://mempool.space/docs/api
- Mempool.space GitHub: https://github.com/mempool/mempool
- Blockstream Esplora: https://github.com/Blockstream/esplora
- Alchemy: https://www.alchemy.com
- QuickNode: https://www.quicknode.com
- Infura: https://www.infura.io

### Token Contracts (Ethereum Mainnet)
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
