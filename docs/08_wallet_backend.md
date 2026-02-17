# Decision 4: Wallet Backend - mobilecoind vs Full-Service

## 1. The Problem

The backend needs to interact with the MobileCoin blockchain: validate [SCIs](./09_glossary.md#sci) submitted to the order book, manage server-side wallets (bridge minting, Solver fee payments), query balances, and broadcast transactions. MobileCoin offers two services for this, with different APIs, capabilities, and tradeoffs.

This decision affects every backend service that touches MobileCoin: the [API Gateway, Solver, Asset Minter](./04_system_components.md), and [bridge](./09_glossary.md#bridge) infrastructure. It also determines how much of Antelope's existing code we can reuse, since Antelope is built entirely on [mobilecoind](./09_glossary.md#mobilecoind).

## 3. The Options

---

### Option A: Full-Service

**Concept:** Run [Full-Service](./09_glossary.md#full-service) as the primary MobileCoin backend. All services connect to it via JSONRPC v2 over HTTP (port 9090). Replace Antelope's mobilecoind gRPC client with a simpler HTTP/JSON client.

**Architecture:**

| Layer | Technology | Detail |
| --- | --- | --- |
| API | JSONRPC v2 over HTTP | Standard JSON requests - trivial to call from Python, JavaScript, or any language |
| Storage | SQLite (wallet DB) + LMDB (ledger DB) | Wallet state persisted locally |
| SCI Support | `validate_proof_of_reserve_sci()` | Validates SCI signatures, ring membership, and ledger presence |
| Account Model | Named [accounts](./09_glossary.md#account) with subaddresses | Richer than mobilecoind's plain [monitors](./09_glossary.md#monitor) - tracks UTXO status (unspent, pending, spent) |
| Hardware Wallet | SLIP-0010 key derivation, offline signing (`sign_tx_blueprint`) | Supports air-gapped transaction signing |
| Deployment | Official Docker images for testnet and mainnet | Production-ready containers |

**Key JSONRPC Methods:**

| Method | Purpose | DEX Usage |
| --- | --- | --- |
| `create_account` | Create a wallet account | Bridge minter account, Solver fee account |
| `build_and_submit_transaction` | Build + submit in one call | Minting wrapped assets, sending withdrawals |
| `build_transaction` | Build without submitting | Solver constructs transactions then reviews before submitting |
| `build_unsigned_burn_transaction` | Burn tokens | Withdraw flow: burn wBTC to trigger BTC release |
| `assign_address_for_account` | Generate subaddresses | Unique deposit addresses for bridge users |
| `validate_proof_of_reserve_sci` | Validate SCI | Order book validation - every SCI submitted to DEQS is checked first |
| `get_account_status` | Balance + UTXO summary | Dashboard, Solver balance monitoring |

**Advantages:**

- **SCI validation built-in.** This is the critical differentiator. Every order submitted to the exchange needs to be validated - Full-Service does this out of the box. mobilecoind cannot.
- **JSONRPC over HTTP.** No protobuf compilation, no gRPC stubs, no code generation. A Python `requests.post()` call is all it takes. Drastically simpler integration from a FastAPI backend.
- **Better account management.** Named accounts, UTXO status tracking (unspent/pending/spent), subaddress management. mobilecoind only has bare "monitors" with no metadata.
- **Docker-ready.** Official container images for testnet and mainnet. mobilecoind has no official Docker images.
- **Hardware wallet support.** SLIP-0010 key derivation and `build_tx_blueprint` for offline signing. Relevant for bridge key management with HSMs.
- **Actively maintained.** 826+ commits, latest v2.10.8. Clear API versioning.

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **No SCI creation.** Full-Service can validate SCIs but cannot create them | Medium | SCI creation happens client-side (in [WASM](./09_glossary.md#wasm)). The backend only needs to validate. If server-side SCI creation is needed (e.g., for the Solver), the `mc-transaction-builder` Rust crate could be used directly, or mobilecoind's `generate_swap_impl()`. |
| **Migration cost.** Antelope's entire MobileCoin layer is built on mobilecoind gRPC. Switching means rewriting `app/services/mobilecoind/` | High | The rewrite replaces complex gRPC/protobuf code with simple HTTP/JSON calls - net reduction in code. Can run both services during migration. |
| **SQLite wallet DB limits.** Full-Service uses SQLite for wallet state. Under extreme concurrent load, SQLite's write lock could become a bottleneck | Low | The DEX would have one server-side wallet (bridge/Solver). Concurrent writes are minimal. If needed, Full-Service can be scaled to multiple instances with separate wallet DBs. |

**What we'd need to change in Antelope:**

| Antelope Module | Current (mobilecoind) | New (Full-Service) |
| --- | --- | --- |
| `app/services/mobilecoind/client.py` (gRPC stub wrapper) | 200+ lines of gRPC channel management, protobuf serialization | Replace with ~50 lines: `httpx.AsyncClient` posting JSON to `localhost:9090/wallet/v2` |
| `app/services/mobilecoind/__init__.py` (739 lines, block processing) | `GetProcessedBlock`, `GetUnspentTxOutList`, `GenerateTx`, `SubmitTx` via gRPC | `get_account_status`, `build_and_submit_transaction` via JSONRPC |
| `app/services/mobilecoind/wallet.py` | Address retrieval, balance queries via monitors | `assign_address_for_account`, `get_account_status` |
| `app/services/mobilecoind/keys.py` | Manual key derivation from mnemonics, b58 parsing | `create_account` with mnemonic import - Full-Service handles derivation |
| `app/services/mobilecoind/protos/` (14 .proto files + compiled stubs) | Generated Python protobuf/gRPC code | **Delete entirely.** No protobuf needed. |
| `app/models/mobilecoind.py` | `MobilecoindWallet`, `MobilecoindIncomingTx`, etc. | Rename models; simplify fields since Full-Service tracks more state internally |
| `app/core/config.py` | `MOBILECOIND_ADDRESS`, `MOBILECOIND_USE_SSL`, `MOBILECOIND_TOKEN_ID` | `FULL_SERVICE_URL` (e.g., `http://localhost:9090/wallet/v2`), `FULL_SERVICE_ACCOUNT_ID` |

---

### Option B: mobilecoind (Keep Current)

**Concept:** Keep Antelope's existing mobilecoind integration. Run mobilecoind as the MobileCoin backend. All services connect via gRPC (protobuf).

**Architecture:**

| Layer | Technology | Detail |
| --- | --- | --- |
| API | gRPC (protobuf) | Binary protocol, requires compiled stubs for each language |
| Storage | LMDB (ledger DB) + custom MobilecoindDB | Simpler storage model - monitors + UTXOs |
| SCI Support | `generate_swap_impl()` - can create SCIs | Server-side SCI generation (unique to mobilecoind) |
| Account Model | Monitors (register key + subaddress range → track UTXOs) | Bare-bones - no UTXO status, no account names |
| Hardware Wallet | None | No offline signing support |
| Deployment | No official Docker images | Must build from source or use community images |

**Key gRPC Operations (currently used by Antelope):**

| Method | Purpose | DEX Usage |
| --- | --- | --- |
| `GetNetworkStatus` | Chain status | Health checks |
| `GetAccountKeyFromMnemonic` | Derive keys | Wallet initialization |
| `AddMonitor` | Start tracking subaddresses | Bridge deposit detection |
| `GetPublicAddress` | Get b58 address | Generate deposit addresses |
| `GetBalance` | Query balance | Dashboard, Solver monitoring |
| `GetProcessedBlock` | Block data for a monitor | Block processor (sweep, incoming tx detection) |
| `GetUnspentTxOutList` | List UTXOs | Transaction building |
| `GenerateTx` / `GenerateOptimizationTx` | Build transactions | Payments, UTXO defragmentation |
| `SubmitTx` | Broadcast | Settlement |
| `GetTxStatusAsSender` | Confirmation status | Transaction lifecycle tracking |
| `generate_swap_impl()` | Create SCI | Server-side SCI creation (Solver could use this) |

**Advantages:**

- **Zero migration cost.** Antelope already works with mobilecoind. The gRPC client, protobuf stubs, block processor, and wallet service are all built and tested.
- **Server-side SCI creation.** `generate_swap_impl()` can create SCIs from the backend - useful if the Solver needs to create its own orders (e.g., for liquidity provision or arbitrage).
- **Watcher integration.** Built-in block signature verification via `--watcher-db`. Useful for monitoring consensus integrity.
- **More direct blockchain access.** Lower-level API gives finer control over UTXO selection, ring sampling, and transaction construction.
- **Offline transactions.** Supports air-gapped transaction construction and submission.

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **No SCI validation.** mobilecoind cannot validate SCIs. Every order submitted to the exchange needs validation before entering the order book | Critical | Would need a separate validation step: either call Full-Service just for validation, or implement validation logic manually using the Rust crate. This partially defeats the purpose of staying on mobilecoind. |
| **gRPC complexity.** Protobuf compilation, code generation, 14 .proto files, binary serialization - significantly more integration overhead than HTTP/JSON | Medium | Already built in Antelope. But any new service that needs MobileCoin access would go through the same gRPC setup. |
| **Weaker account management.** Monitors are bare-bones. No UTXO status tracking means custom "pending vs confirmed" logic is needed | Medium | Antelope already has custom logic for this in its block processor. But it's fragile and less complete than Full-Service's built-in tracking. |
| **No Docker images.** Must build mobilecoind from the MobileCoin monorepo (requires SGX build environment) | Low | Can create our own Dockerfile. But this adds maintenance burden. |
| **Uncertain maintenance.** mobilecoind is part of the monorepo, but MobileCoin's investment has shifted toward Full-Service | Medium | Monitor for deprecation signals. Keep Full-Service as a migration path. |

---

### Option C: Both (Hybrid)

**Concept:** Use Full-Service as the primary backend (for validation, account management, transaction building) and keep mobilecoind running alongside it for specific capabilities (server-side SCI creation, watcher integration).

**Architecture:**

```
API Gateway / Solver / Bridge
    │                    │
    ▼                    ▼
Full-Service         mobilecoind
(JSONRPC:9090)       (gRPC:4444)
    │                    │
    └──────┬─────────────┘
           ▼
    MobileCoin Network
```

Both services sync the same blockchain independently. They share no state - each maintains its own ledger DB.

**When to use which:**

| Operation | Service | Why |
| --- | --- | --- |
| SCI validation | Full-Service | Only service with `validate_proof_of_reserve_sci()` |
| Balance queries | Full-Service | Better account model, UTXO status tracking |
| Transaction building | Full-Service | `build_and_submit_transaction`, cleaner API |
| Server-side SCI creation | mobilecoind | `generate_swap_impl()` - not available in Full-Service |
| Block signature verification | mobilecoind | Watcher mode for consensus integrity monitoring |
| Subaddress management | Full-Service | Named accounts, automatic subaddress generation |

**Advantages:**

- Best of both worlds. SCI validation from Full-Service, SCI creation from mobilecoind.
- Gradual migration. Start by adding Full-Service for new features, migrate away from mobilecoind over time.
- No capability gaps.

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Operational complexity.** Two blockchain-syncing services, double the disk usage (~2� -  ledger DB), two sets of config/monitoring | Medium | Worth it during transition. Retire mobilecoind once Full-Service gains SCI creation or we move SCI creation fully to WASM. |
| **State inconsistency.** Both services sync independently. A transaction seen by one may not yet be seen by the other | Low | Both sync from the same consensus network. Lag is typically <1 block (~5 seconds). For critical operations, query both and use the more conservative answer. |
| **Double resource usage.** Each service runs its own ledger sync, consuming CPU, disk, and network bandwidth | Low | MobileCoin's blockchain is small (~1GB). Syncing is lightweight compared to Bitcoin or Ethereum. |

---

## 4. Comparison

| Dimension | Full-Service | mobilecoind | Both (Hybrid) |
| --- | --- | --- | --- |
| **API** | JSONRPC v2 (HTTP) | gRPC (protobuf) | Both available |
| **SCI validation** | Yes | No | Yes (via Full-Service) |
| **SCI creation (server-side)** | No | Yes (`generate_swap_impl`) | Yes (via mobilecoind) |
| **Integration effort from Python** | Trivial (HTTP/JSON) | Complex (protobuf compilation, stubs) | Moderate |
| **Account management** | Rich (named accounts, UTXO status) | Basic (monitors) | Rich |
| **Hardware wallet** | Yes (SLIP-0010, blueprints) | No | Yes |
| **Docker** | Official images | No official images | One official, one custom |
| **Antelope migration cost** | High (rewrite mobilecoind layer) | Zero | Low (add Full-Service alongside, migrate gradually) |
| **Operational overhead** | One service | One service | Two services |
| **Maintenance outlook** | Actively developed, clear roadmap | Part of monorepo, less focused investment | Both |

## 5. Recommendation

**Option C (Hybrid) for MVP, transitioning to Option A (Full-Service only).**

**Phase 1 - MVP launch:**
- Deploy Full-Service alongside Antelope's existing mobilecoind.
- Use Full-Service for all new code: SCI validation, bridge account management, Solver balance queries.
- Keep mobilecoind for Antelope's existing block processor and any server-side SCI creation needs.

**Phase 2 - Post-MVP:**
- Migrate Antelope's block processor from mobilecoind gRPC to Full-Service JSONRPC.
- Replace `app/services/mobilecoind/client.py` with a Full-Service HTTP client.
- Delete protobuf stubs and gRPC dependencies.

**Phase 3 - Retire mobilecoind:**
- Once SCI creation is fully client-side (WASM) and Full-Service covers all backend needs, shut down mobilecoind.
- Reduces operational overhead to a single MobileCoin backend service.

**Why not Full-Service only from day one?** The migration cost of rewriting Antelope's mobilecoind layer is significant for MVP timeline. Running both in parallel lets us use Full-Service for new features immediately while migrating the existing code at a sustainable pace.

See [Proposed System Components](./04_system_components.md) for how the wallet backend fits into each architecture scenario.

## 6. Open Questions

1. Does Full-Service's `validate_proof_of_reserve_sci` check [key images](./09_glossary.md#key-image) against the ledger (i.e., detect already-spent SCIs), or only validate the cryptographic signature? The [source code comment](./10_initial_research.md) says "does NOT check if the TxOut key image appears in the ledger" - if so, we need a separate key-image check.
2. Will Full-Service add SCI creation (`build_sci` or equivalent) in a future release? This would eliminate the last reason to keep mobilecoind.
3. Can Full-Service and mobilecoind share the same LedgerDB on disk, or must each maintain its own copy?
4. What are Full-Service's resource requirements (RAM, CPU, disk) at mainnet scale? Benchmark on testnet.
5. Does Antelope's mobilecoind block processor logic (sweep, defrag, incoming tx detection) have a direct equivalent in Full-Service's API, or does it need to be reimplemented?
6. Is `generate_swap_impl()` in mobilecoind's payments module accessible via the gRPC API, or only as a Rust library call? If only Rust, we may need a thin Rust wrapper service.
