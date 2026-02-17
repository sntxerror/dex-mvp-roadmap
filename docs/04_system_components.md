# Proposed System Components

This document maps every open architectural decision to the concrete services it would create. Nothing here is decided — each component depends on one or more of the choices explored in the Decision documents. The goal is to show what we'd need to build under each combination so the team can evaluate tradeoffs against a shared picture.

**Open decisions that shape the system:**

| # | Decision | Options Under Consideration | Explored In |
| --- | --- | --- | --- |
| 1 | Frontend platform | Web ([WASM](./09_glossary.md#wasm)) · Desktop ([Electron](./09_glossary.md#electron)/[Tauri](./09_glossary.md#tauri)) | [Decision 1](./05_frontend_platform.md) |
| 2 | Matching engine | Order Book + [Solver](./09_glossary.md#solver) · Pure P2P · Hybrid | [Decision 2](./06_matching_engine.md) |
| 3 | Asset integration | Centralized [Bridge](./09_glossary.md#bridge) · Federated Bridge · [Atomic Swaps](./09_glossary.md#atomic-swap) via [Oracle](./09_glossary.md#oracle) · MOB-only (no external assets) | [Decision 3](./07_asset_integration.md) |
| 4 | Wallet backend | [Full-Service](./09_glossary.md#full-service) · [mobilecoind](./09_glossary.md#mobilecoind) · Both (hybrid) | [Decision 4](./08_wallet_backend.md) |
| — | Codebase path | Antelope fork vs. From scratch · DEQS vs. Custom order book | [Arch. Decisions §5](./02_architecture_decisions.md#5-codebase--order-book-antelope-fork-vs-from-scratch-deqs-vs-custom) |

Each service below is tagged with **Depends on** to show which open decision(s) activate it.

**Example configuration** — see [Example System Configuration](./03_diagrams.md#example-system-configuration) for a diagram illustrating one possible combination: Web/WASM frontend, Antelope fork, DEQS order book, Full-Service + mobilecoind wallet, centralized bridge. Other combinations would look different — this is just a reference point.

---

## Fixed Components

These exist regardless of which options are chosen.

| Component | Technology | Purpose |
| --- | --- | --- |
| **Fog Endpoint** | MobileCoin infrastructure (gRPC, [SGX enclave](./09_glossary.md#sgx-enclave)) | Transaction discovery — the only way to detect incoming payments |
| **MobileCoin Network** | Consensus validators (SGX enclaves) | Settlement layer — processes all MOB and [wAsset](./09_glossary.md#wasset) transactions |
| **PostgreSQL** | Relational database | Trade history, bridge records (if bridge), user sessions |
| **Redis** | Cache / message broker | WebSocket distribution, rate limiting |

### Fog Service

| | |
| --- | --- |
| **Type** | Privacy-preserving transaction discovery |
| **Stack** | MobileCoin infrastructure — runs inside SGX enclaves |
| **Logic** | User provides a detection key (derived from View Key). Fog scans new blocks inside an enclave and returns only matching transactions — without learning the user's identity or transaction contents. |
| **Connects to** | MobileCoin Network (ledger) |
| **Used by** | Frontend (gRPC-web or native gRPC), Full-Service, mobilecoind |
| **Critical** | Hard dependency. Without Fog, the app cannot display balances or detect incoming payments. |
| **See also** | [System Design Section 1](./01_system_design.md#1-fog-private-transaction-discovery) |

---

## Frontend — depends on Decision 1

The frontend is where users interact with the DEX and where private keys live. The choice between web and desktop affects the crypto execution layer, distribution model, and security posture. See [Decision 1](./05_frontend_platform.md) for the full comparison.

### If Web (WASM) — suggested

| | |
| --- | --- |
| **Type** | Static web application (SPA) |
| **Stack** | React 19, TypeScript, Vite |
| **WASM Modules** | `mc-transaction-builder`, `mc-crypto-keys`, `mc-fog-report-resolver` |
| **Connects to** | API Gateway (REST/WebSocket), Fog (gRPC-web) |
| **Owns** | User's private keys (encrypted in localStorage), [SCI](./09_glossary.md#sci) creation, transaction signing |
| **Does NOT do** | Store keys on any server, delegate signing to backend |
| **Build output** | Static files (HTML + JS + WASM binary), deployed to CDN |
| **Key risk** | `mc-transaction-builder` has not been publicly compiled to WASM yet — this is unproven |

### If Desktop (Electron/Tauri)

| | |
| --- | --- |
| **Type** | Installable desktop application |
| **Stack** | React (inside Electron or Tauri webview), native Rust crypto backend |
| **Connects to** | API Gateway (REST/WebSocket), Fog (native gRPC — no proxy needed) |
| **Owns** | User's private keys (OS keychain or encrypted file), SCI creation, transaction signing |
| **Does NOT do** | Store keys on any server |
| **Build output** | Signed binaries per platform (.exe, .dmg, .AppImage) |
| **Key risk** | Install friction kills adoption; 3× the platform testing surface |

---

## API Gateway — present in all configurations

| | |
| --- | --- |
| **Type** | HTTP/WebSocket server |
| **Stack** | FastAPI (Python) — forked from Antelope if [Path A/B](./02_architecture_decisions.md#path-comparison), or built fresh if [Path C/D](./02_architecture_decisions.md#path-comparison) |
| **Endpoints** | `POST /orders` (submit SCI), `GET /orders` (query book), `GET /trades` (history), `WS /ws/orderbook` (live updates). Bridge endpoints (`GET /bridge/deposit-address`) only if bridge is chosen. |
| **Connects to** | Wallet backend (validation), order book (SCI storage), PostgreSQL, Redis |
| **Owns** | Trade history, WebSocket sessions, bridge records (if applicable) |
| **Does NOT do** | Hold any private keys, execute trades |

---

## Order Book & Matching — depends on Decision 2 + Codebase Path

How orders are stored, discovered, and matched. See [Decision 2](./06_matching_engine.md) for the full comparison.

### If Order Book + Solver — suggested

#### DEQS Node (if using DEQS — [Paths A/C](./02_architecture_decisions.md#path-comparison))

| | |
| --- | --- |
| **Type** | Order book service |
| **Stack** | Rust, gRPC API ([repo](https://github.com/mobilecoinofficial/deqs)) |
| **API** | `SubmitQuotes` (batch ≤30), `GetQuotes` (filter by pair/range), `LiveUpdates` (streaming) |
| **Internal** | QuoteBook (SCI storage), SynchronizedQuoteBook ([key-image](./09_glossary.md#key-image) cleanup), P2P distribution |
| **Connects to** | MobileCoin Network (key-image monitoring), other DEQS nodes (P2P) |
| **Owns** | Active SCIs, order matching metadata |
| **See also** | [System Design Section 3](./01_system_design.md#3-deqs-the-order-book) |

#### Custom Order Book (if not using DEQS — [Paths B/D](./02_architecture_decisions.md#path-comparison))

| | |
| --- | --- |
| **Type** | Custom order book service |
| **Stack** | Python or Rust, PostgreSQL or SQLite |
| **Would need** | SCI validation logic, key-image monitoring worker (block scanner), storage, quote distribution |
| **Tradeoff** | Full control over matching logic, but significant engineering effort to replicate what DEQS does out of the box |

#### Solver Bot

| | |
| --- | --- |
| **Type** | Background daemon |
| **Stack** | Python or Rust |
| **Logic** | Polls order book for [crossing orders](./09_glossary.md#crossing-orders), combines SCIs into settlement transactions, submits to MobileCoin |
| **Connects to** | Order book (DEQS or custom), wallet backend (build transactions), MobileCoin Network (submit) |
| **Owns** | Match detection, transaction construction |
| **Does NOT own** | A wallet with user funds — the [Solver](./09_glossary.md#solver) only needs a small amount of MOB to pay network fees |

### If Pure P2P

No Solver, no centralized order book. Users share SCIs directly via links, QR codes, or a simple bulletin board. The "exchange" is just a UI for creating and filling SCIs. Minimal infrastructure, but no [liquidity](./09_glossary.md#liquidity) discovery, no price discovery, and both parties must be online.

### If Hybrid

Order Book + Solver as the primary path, with an additional "Create Private Swap" flow that generates a shareable link without publishing to the public book. Requires building both systems.

---

## Wallet Backend — depends on Decision 4

How the backend talks to the MobileCoin blockchain. See [Decision 4](./08_wallet_backend.md) for the full comparison.

### If Full-Service — suggested primary

| | |
| --- | --- |
| **Type** | Wallet daemon |
| **Stack** | Rust binary providing JSONRPC v2 over HTTP (port 9090) |
| **Key Functions** | `validate_proof_of_reserve_sci()`, account management, transaction building, balance queries |
| **Connects to** | MobileCoin Network (consensus), Fog (balance scanning) |
| **Owns** | Server-side wallet (for Solver fee payments, bridge minting if applicable), SCI validation logic |
| **See also** | [Architecture Decisions Section 7](./02_architecture_decisions.md#7-wallet-backend-mobilecoind-vs-full-service), [Decision 4](./08_wallet_backend.md) |

### If mobilecoind — Antelope compatibility ([Paths A/B](./02_architecture_decisions.md#path-comparison))

| | |
| --- | --- |
| **Type** | Blockchain daemon |
| **Stack** | Rust binary providing gRPC over protobuf (port 4444) |
| **Key Functions** | `GenerateTx`, `SubmitTx`, `GetBalance`, `AddMonitor`, `generate_swap_impl` (SCI creation) |
| **Connects to** | MobileCoin Network (ledger sync), Fog (transaction discovery) |
| **Why relevant** | Antelope's existing code depends on it. Could be kept during migration and retired later. |
| **See also** | [Decision 4](./08_wallet_backend.md) |

### If Both (hybrid) — suggested for Antelope fork paths

Run Full-Service for new features (SCI validation, account management) alongside mobilecoind for existing Antelope code. Migrate gradually, retire mobilecoind when no longer needed.

---

## Asset Integration Services — depends on Decision 3

These services only exist if the DEX supports trading non-MobileCoin assets (BTC, ETH, USDC, USDT). If the initial release is MOB-only, none of this section applies. See [Decision 3](./07_asset_integration.md) for the full comparison.

### If Bridge (centralized or federated)

These services handle the deposit → mint → trade → burn → withdraw lifecycle for wrapped assets.

#### Bitcoin Watcher

| | |
| --- | --- |
| **Type** | Background worker |
| **Stack** | Python, Mempool.space REST/WebSocket (self-hosted or public) |
| **Logic** | Monitors deposit addresses, tracks confirmations (6 required), handles RBF invalidation |
| **Connects to** | Bitcoin Network, PostgreSQL (deposit records), Asset Minter (trigger) |

#### Ethereum Watcher

| | |
| --- | --- |
| **Type** | Background worker |
| **Stack** | Python, Alchemy WebSocket (primary), QuickNode (fallback) |
| **Logic** | Filters `Transfer` events on USDC/USDT contracts, tracks confirmations (12-20 required), handles reorgs |
| **Connects to** | Ethereum Network, PostgreSQL, Asset Minter |

#### Asset Minter / Coordinator

| | |
| --- | --- |
| **Type** | Privileged service (handles minting keys) |
| **If centralized bridge** | Holds [minting key](./09_glossary.md#minting-key) directly (HSM-backed). Creates and submits MintTx (MCIP 37). |
| **If federated bridge** | Becomes a Coordinator: collects [Guardian](./09_glossary.md#federation--guardians) partial signatures, aggregates into valid MintTx. Has no signing power itself. |
| **Connects to** | Wallet backend (build MintTx), MobileCoin Network (submit), Guardians (if federated) |
| **Critical** | Keys should be in HSM. Rate limits on minting. Alerting on unusual activity. |

#### Burn Detector

| | |
| --- | --- |
| **Type** | Background worker |
| **Stack** | Python |
| **Logic** | Scans MobileCoin blocks for burn transactions, extracts embedded withdrawal addresses from memos |
| **Connects to** | MobileCoin Network (block scanning), BTC Sender / ETH Sender (triggers withdrawal) |

#### BTC Sender

| | |
| --- | --- |
| **Type** | Withdrawal service |
| **Stack** | Python, Bitcoin node RPC |
| **Logic** | Releases real BTC from [hot wallet](./09_glossary.md#hot-wallet) when Burn Detector triggers a withdrawal |
| **Connects to** | Bitcoin Network, PostgreSQL (withdrawal records) |

#### ETH Sender

| | |
| --- | --- |
| **Type** | Withdrawal service |
| **Stack** | Python, Web3 |
| **Logic** | Releases real ETH/ERC-20 from hot wallet when Burn Detector triggers a withdrawal |
| **Connects to** | Ethereum Network, PostgreSQL (withdrawal records) |

#### Guardian Nodes (federated bridge only)

| | |
| --- | --- |
| **Type** | Independent service run by each [federation](./09_glossary.md#federation--guardians) member |
| **Stack** | Rust, Go, or Python |
| **Modules** | Bitcoin Watcher, Ethereum Watcher, MobileCoin Scanner, Signing Engine (HSM), P2P comms |
| **Connects to** | Bitcoin/Ethereum nodes, MobileCoin Network, Coordinator, other Guardians |
| **Trust model** | k-of-n threshold (recommended: 3-of-5 minimum, 2+ external) |
| **See also** | [Decision 3](./07_asset_integration.md) |

### If Atomic Swaps (via Oracle)

No wrapping, no bridge. Users trade real BTC for real MOB by coordinating transactions on both chains. These services replace the entire bridge stack.

#### Oracle Service

| | |
| --- | --- |
| **Type** | High-availability attestation service |
| **Stack** | Rust or Go |
| **Logic** | Queries Bitcoin/Ethereum nodes, verifies transactions, returns Ed25519 signed attestations |
| **Trust** | Cannot steal funds (no wallet keys). Can only confirm or deny. False attestation = fraud risk → mitigate with multiple Oracles (k-of-n). |
| **See also** | [Decision 3](./07_asset_integration.md) |

#### HTLC Manager

| | |
| --- | --- |
| **Type** | Background service |
| **Stack** | Python or Rust |
| **Logic** | Generates and monitors [HTLC](./09_glossary.md#htlc) scripts on Bitcoin. Tracks timeouts. Handles refund claims. |
| **See also** | [Decision 3](./07_asset_integration.md) |

### If MOB-only (no external assets initially)

None of the above services are needed. The DEX trades only MOB-denominated token pairs that already exist on the MobileCoin ledger. External asset support can be added later without changing the core trading stack.

---

## How Components Interact

### Trade Flow

*Assumes: Web/WASM frontend, Order Book + Solver, DEQS, Full-Service wallet backend.*

From SCI creation to settlement, mapped to services. See [Trade Flow diagram](./03_diagrams.md#trade-flow).

### Bridge Flow (Deposit & Withdrawal)

*Assumes: Centralized bridge with Bitcoin. Only applies if bridge is chosen (Decision 3).*

See [Bridge Flow diagram](./03_diagrams.md#bridge-flow).

### Fog Balance Scanning

How the frontend discovers incoming payments without revealing user identity. See [Fog Balance Scanning diagram](./03_diagrams.md#fog-balance-scanning) and [System Design Section 1](./01_system_design.md#1-fog-private-transaction-discovery).

### Order Lifecycle

*Assumes: Order Book + Solver model (Decision 2).*

An order progresses from creation through matching to settlement. [Partial fills](./09_glossary.md#partial-fill) consume the original SCI and produce a change output that can be relisted. See [Order Lifecycle diagram](./03_diagrams.md#order-lifecycle) and [Architecture Decisions Section 3](./02_architecture_decisions.md#3-partial-fill-mechanics).

---

## Inter-Service Communication

Not all rows apply in every configuration. Rows are tagged with which decision activates them.

| From → To | Protocol | Notes | Depends on |
| --- | --- | --- | --- |
| Frontend → API Gateway | HTTPS REST + WebSocket | Standard web traffic. WebSocket for live order book updates. | All configs |
| Frontend → Fog | gRPC-web (web) or native gRPC (desktop) | May need an Envoy proxy if Fog doesn't support gRPC-web natively. | All configs |
| API Gateway → Full-Service | HTTP (JSONRPC v2) | Internal network only. `localhost:9090`. | Decision 4: Full-Service chosen |
| API Gateway → mobilecoind | gRPC (protobuf) | Internal. Antelope's existing integration. Port `4444`. | Decision 4: mobilecoind kept ([Paths A/B](./02_architecture_decisions.md#path-comparison)) |
| API Gateway → DEQS | gRPC | `SubmitQuotes`, `GetQuotes`, `LiveUpdates`. | Decision 2: Order Book + [Paths A/C](./02_architecture_decisions.md#path-comparison) |
| API Gateway → Custom Order Book | Internal (same process or gRPC) | Replaces DEQS. | Decision 2: Order Book + [Paths B/D](./02_architecture_decisions.md#path-comparison) |
| Solver → Order Book | gRPC or internal | Solver queries and subscribes to order updates. | Decision 2: Order Book + Solver |
| Solver → MobileCoin Network | Via wallet backend | Solver submits constructed transactions. | Decision 2: Order Book + Solver |
| Watchers → Minter/Coordinator | Internal trigger (DB flag or message queue) | Watcher writes deposit record → Minter picks it up. | Decision 3: Bridge |
| Burn Detector → Senders | Internal trigger | Same pattern as Watchers → Minter. | Decision 3: Bridge |
| Guardians → Coordinator | HTTPS or P2P | Guardians send partial signatures. Coordinator aggregates. | Decision 3: Federated bridge |
| Guardians ↔ Guardians | P2P (libp2p or custom) | Exchange attestations for deposit verification. | Decision 3: Federated bridge |
| Oracle → Frontend | HTTPS | Taker fetches attestation to claim MOB. | Decision 3: Atomic swaps |

---

## If Forking Antelope ([Paths A/B](./02_architecture_decisions.md#path-comparison) only)

This section only applies if the Antelope codebase is used as a starting point. See [Architecture Decisions Section 5](./02_architecture_decisions.md#5-codebase--order-book-antelope-fork-vs-from-scratch-deqs-vs-custom) for why this path is being considered and what Antelope provides.

| Antelope Module | What Could Be Taken | What Would Change |
| --- | --- | --- |
| `app/core/` | Config, auth/JWT, error handling | Remove BigONE, DTR, referral config |
| `app/workers/` | Worker pipeline architecture, trigger system | Replace RFQ workers with bridge/matching workers |
| `app/services/mobilecoind/` | gRPC client, protobuf stubs | Keep initially, migrate to Full-Service per [Decision 4](./08_wallet_backend.md) |
| `clients/dtr/` | Nothing | Remove entirely — no fiat |
| `clients/bigone/` | Nothing | Remove entirely — no CEX hedging |
| `app/routes/` | Route structure, middleware, pagination | Replace with order/bridge/wallet endpoints |
| `app/models/` | Base model patterns, Alembic migrations setup | New models for orders, bridge deposits, trade history |
| `app/db/` | Session management, connection pooling | Keep as-is |
| `frontend/` | React/Vite/Tailwind setup, component patterns | New trading UI, add WASM integration |
