# Architecture Decisions

This document explores the architectural choices and engineering details for a proposed MobileCoin DEX. Each section outlines a decision area for discussion and links to its dedicated decision document where applicable.

For the core technologies these decisions build on (Fog, [SCI](./09_glossary.md#sci), [DEQS](./09_glossary.md#deqs), [Ring Signatures](./09_glossary.md#ring-signatures), [WASM](./09_glossary.md#wasm)), see [System Design](./01_system_design.md).

---

## Table of Contents

1. [Frontend Platform](#1-frontend-platform)
2. [Matching Engine](#2-matching-engine)
3. [Partial Fill Mechanics](#3-partial-fill-mechanics)
4. [Asset Integration: Trading Non MobileCoin Currencies](#4-asset-integration-trading-non-mobilecoin-currencies)
5. [Codebase & Order Book: Antelope Fork vs. From Scratch, DEQS vs. Custom](#5-codebase--order-book-antelope-fork-vs-from-scratch-deqs-vs-custom)
   - [What Antelope Gives Us](#what-antelope-gives-us)
   - [Path Comparison](#path-comparison)
   - [Suggested Path](#suggested-path)
6. [Legacy Code](#6-legacy-code)
   - [Broker Dealer Model (remove)](#broker-dealer-model-remove)
   - [DTR: Direct to Retail (remove)](#dtr-direct-to-retail-remove)
7. [Wallet Backend: mobilecoind vs Full-Service](#7-wallet-backend-mobilecoind-vs-full-service)

---

## 1. Frontend Platform

**Open question:** Where does the sensitive cryptography (key management and signing) happen?

Two options: **Web Browser (WASM)** - zero-install, instant updates, familiar UX, but requires proving MobileCoin's Rust crates compile to WASM. **Desktop App ([Electron](./09_glossary.md#electron)/[Tauri](./09_glossary.md#tauri))** - stronger security posture, native performance, but install friction kills adoption.

**Suggestion:** Web/WASM for the initial release. Desktop as a fallback or power-user option.

For the full comparison - architecture, risk analysis, what we'd need to build for each, and open questions - see **[Decision 1: Frontend Platform](./05_frontend_platform.md)**.

---

## 2. Matching Engine

**Open question:** How do buyers and sellers find each other?

In any exchange, someone posts an offer and someone else fills it. The "matching engine" is the mechanism that connects these two sides. In a traditional exchange, a central server manages the order book and executes trades. In MobileCoin's privacy-focused world, the design is more nuanced: users create [SCIs](./09_glossary.md#sci) (cryptographic "intent to trade" blobs), but something still needs to discover compatible orders, combine them into a valid transaction, and submit it to the network.

This decision shapes the core UX — does the DEX feel like a professional trading platform with limit orders and depth charts, or like a peer-to-peer marketplace where users manually coordinate? It also determines the trust model: who sees the orders, who constructs the final transaction, and what power the operator has.

Three options: **Order Book with [Solver](./09_glossary.md#solver)** — users post passive SCIs to a shared book, an automated bot scans for price-crossing pairs and settles them. Professional UX, efficient [partial fills](./09_glossary.md#partial-fill), set-and-forget, but the Solver sees order flow (though not identities, thanks to [ring signatures](./09_glossary.md#ring-signatures)). **Pure P2P** — users share SCIs directly via links or messaging. Maximum privacy, no central operator, but no [liquidity](./09_glossary.md#liquidity) discovery and no automated matching — each party must be online. **Hybrid** — an order book as the primary venue, with private swap links as an advanced feature for users who want off-book trades.

For the full comparison — Solver architecture, P2P flow, trust analysis, and DEQS vs. custom tradeoffs — see **[Decision 2: Matching Engine](./06_matching_engine.md)**.

---

## 3. Partial Fill Mechanics

[Partial fills](./09_glossary.md#partial-fill) are essential for a real order book (see [System Design: Partial Fills](./01_system_design.md#partial-fills-mcip-42)), but they create a "recursive" problem that the system would need to handle.

When Bob fills 20% of Alice's 1000 MOB order, the transaction produces:

| Output | Description |
| --- | --- |
| Bob's wallet: 200 MOB | The fill |
| Alice's wallet: payment for 200 MOB | The revenue |
| Alice's wallet: 800 MOB | The change |

Alice's original SCI (1000 MOB) is now "spent" and dead. She has 800 MOB in her wallet, but **no active order**.

**Solutions:**

| Approach | How it works | Status |
| --- | --- | --- |
| **Manual Relist** | Alice comes back online, sees the partial fill, signs a new SCI for 800 MOB | Works today |
| **Client Auto-Relist** | Alice's browser auto-detects the change output and auto-signs a new SCI | Suggested approach |
| **Recursive Covenants** | The change output automatically locks into a new SCI on-chain | Not available yet (future MobileCoin upgrade) |

> **Note:** Initially, we could rely on Client Auto-Relist or simply treat partial fills as "fill what you can, the rest is returned to wallet." The Solver could handle the re-listing flow when users are online.

---

## 4. Asset Integration: Trading Non MobileCoin Currencies

**Open question:** How do users trade BTC, ETH, USDC, and USDT when [SCIs](./01_system_design.md#2-sci-the-trustless-swap-primitive) only work within the MobileCoin ledger?

Three options: **Centralized [Bridge](./09_glossary.md#bridge)** - single operator mints wrapped tokens (wBTC, wETH). Fastest to build, highest regulatory risk. **Federated Bridge** - distributed group of [Guardians](./09_glossary.md#federation--guardians) (k-of-n threshold signatures). Same UX, distributed trust. **Direct [Atomic Swaps](./09_glossary.md#atomic-swap) via [Oracle](./09_glossary.md#oracle)** - no wrapping, real BTC↔MOB trades. Zero custody, but slow (10-60 min per swap) and complex.

**Suggestion:** Start with a centralized bridge for the initial release, transition to a federated bridge before scaling, and consider adding atomic swaps later as a trustless option.

For the full comparison - deposit/withdrawal flows, architecture diagrams, security threat models, Guardian selection, Oracle trust analysis, external chain monitoring infrastructure, and regulatory implications - see **[Decision 3: Asset Integration](./07_asset_integration.md)**.

---

## 5. Codebase & Order Book: Antelope Fork vs. From Scratch, DEQS vs. Custom

 The DEX could take several directions depending on whether we reuse [DEQS](./01_system_design.md#3-deqs-the-order-book) and whether we build on the Antelope codebase. This section compares all four paths.

### What Antelope Gives Us

[Antelope](https://github.com/lopenexus/antelope) is an existing centralized broker/swap service (not a DEX). It implements an RFQ (Request-For-Quote) flow: user requests a quote → server fetches a price from an external exchange → user deposits funds → server executes a hedge trade → server sends the target asset.

**Reusable parts:**

| Component | Detail |
| --- | --- |
| MobileCoin blockchain client | `mobilecoind` gRPC wrapper, Fog-enabled key management, block processor |
| Ethereum blockchain client | Web3, HD wallet, block processor with reorg detection, ERC-20 support |
| Worker pipeline | Trigger-based background task system - block scanning, transaction lifecycle, sweep/defrag |
| Infrastructure | FastAPI skeleton, auth/JWT, PostgreSQL/Alembic, Docker, logging |
| Frontend shell | React 19, Vite, TypeScript, MetaMask/WalletConnect integration |

**Not reusable (likely to be replaced):**

| Component | Why |
| --- | --- |
| BigONE CEX integration | Centralized exchange - opposite of the DEX goal |
| RFQ pricing logic | Broker markup, not market-driven |
| DTR fiat on/off-ramp | A crypto-to-crypto DEX likely wouldn't touch fiat (see [Legacy Code](#6-legacy-code)) |
| KYC/SumSub, Signal integration, referral system | Not needed for a crypto-to-crypto DEX |

**Key gap:** Antelope has **zero** SCI, DEQS, or order-matching support. All trading logic would be built new.

### Path Comparison

|  | **With DEQS** | **Without DEQS** |
| --- | --- | --- |
| **With Antelope** | **Path A:** Fork Antelope, replace BigONE/RFQ with DEQS client. Reuse blockchain clients, workers, infra. Add SCI creation in frontend (WASM). DEQS handles order storage, validation, distribution. The backend becomes a thin API layer + matching engine. | **Path B:** Fork Antelope, build custom order book from scratch. Reuse blockchain clients, workers, infra. Build custom SCI storage, validation, key-image monitoring, and quote distribution. More work, but full control over matching logic. |
| **Without Antelope** | **Path C:** Build from scratch with DEQS. Use DEQS as the order book. Build new backend (FastAPI or Rust) with Full-Service wallet instead of mobilecoind. Build new frontend. Cleanest architecture, but rebuilds infrastructure that Antelope already has. | **Path D:** Build everything from scratch. No DEQS, no Antelope. Custom order book, custom blockchain clients, custom infra. Maximum control, maximum effort. Only justified if both DEQS and Antelope are fundamentally unsuitable. |

### Suggested Paths

**[Path A](#path-comparison) (Antelope + DEQS)** appears to be the fastest route to a working prototype:

- Antelope's MobileCoin/Ethereum clients and worker pipeline save months of infrastructure work.
- DEQS solves SCI storage, validation, and key-image cleanup - the hardest backend problems.
* This would let us focus engineering effort on what's truly new: [WASM SCI creation](./01_system_design.md#5-wasm-running-crypto-in-the-browser), matching engine, [bridge](./07_asset_integration.md), and the trading UI.

**[Path B](#path-comparison) (Antelope, no DEQS)** is the fallback if DEQS proves too rigid (e.g. if we need complex multi-leg matching that DEQS can't support).

**[Path C or D](#path-comparison)** should only be considered if Antelope's codebase proves too tightly coupled to the broker model to refactor, or if we decide to write the backend in Rust.

See [Proposed System Components](./04_system_components.md) for how each path maps to concrete services and their relationships.

---

## 6. Legacy Code

If the Antelope codebase is forked, it's worth noting it was built for a different business model. Understanding what to keep and what to remove would avoid wasted effort.

### Broker Dealer Model (remove)

Antelope currently acts as a **shop**, not a marketplace. The server is the counterparty to every trade - it buys asset X from an external exchange and sells it to the user. It takes custody (briefly) and risk. A DEX would be the opposite: the server never holds funds, and users trade directly with each other via [SCIs](./01_system_design.md#2-sci-the-trustless-swap-primitive).

### DTR: Direct to Retail (remove)

This is the module that connects to banking rails (fiat). It handles KYC (Know Your Customer) and AML checks because it touches USD.

If the DEX is crypto-to-crypto only, DTR would not be needed. Removing it would also simplify the legal picture - the project becomes a software provider, not a financial intermediary.

---

## 7. Wallet Backend: mobilecoind vs Full-Service

**Open question:** How does the backend talk to the MobileCoin blockchain?

Two services exist:

**[mobilecoind](./09_glossary.md#mobilecoind)** - MobileCoin's original daemon (gRPC/protobuf), used by Antelope today. Lower-level, can create SCIs server-side, but cannot validate them.
**[Full-Service](./09_glossary.md#full-service)** - newer JSONRPC wallet service (HTTP/JSON), cleaner API, built-in SCI validation, Docker-ready, but cannot create SCIs.

| Capability | mobilecoind | Full-Service |
| --- | --- | --- |
| API protocol | gRPC (protobuf) | JSONRPC v2 (HTTP) |
| SCI validation | No | Yes |
| SCI creation (server-side) | Yes | No |
| Account management | Basic ([monitors](./09_glossary.md#monitor)) | Rich (named accounts, UTXO status) |
| Hardware wallet | No | Yes (SLIP-0010) |
| Docker images | No | Official testnet/mainnet |
| Antelope integration | Already built | Requires migration |

**Suggestion:** Run both during the initial phase (Full-Service for new features, mobilecoind for existing Antelope code), then gradually migrate to Full-Service and retire mobilecoind.

For the full comparison - migration plan, API method mapping, Antelope rewrite scope, and hybrid architecture - see **[Decision 4: Wallet Backend](./08_wallet_backend.md)**.
