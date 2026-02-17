# Glossary

Common terms used across proposed MobileCoin DEX documentation.

---

### Account

Full-Service's concept of a wallet identity - richer than mobilecoind's Monitor: named accounts, multiple subaddresses, UTXO status tracking.

### Atomic Swap

A trade that happens in one transaction. Either both parties get paid, or the transaction fails. No one can "take the money and run."

### Bridge

A service that locks real assets on one chain and mints wrapped tokens on another. See [Decision 3](./07_asset_integration.md).

### Crossing Orders

Two orders where the buy price meets or exceeds the sell price - a trade can happen.

### Custodian

An entity that holds possession of client funds and keys.

### DEQS

Decentralized Exchange Quote Service - MobileCoin's reference order book for SCIs ([repo](https://github.com/mobilecoinofficial/deqs)). See [System Design](./01_system_design.md#3-deqs-the-order-book).

### Electron

A framework for building desktop apps using web technologies (Chromium + Node.js). Slack, Discord, and VS Code use it.

### Enclave

A secure area of the processor (Intel SGX) that protects code and data from disclosure or modification.

### Federation / Guardians

A group of independent operators that collectively manage bridge keys via threshold signatures.

### Fog View

The service scanning the blockchain for user funds. Critical dependency - without Fog, the app is unusable. See [System Design](./01_system_design.md#1-fog-private-transaction-discovery).

### Fog View Key

A special key that allows Fog to scan the blockchain for your incoming money without being able to spend it.

### Full-Service

MobileCoin's JSONRPC wallet service for account management, transaction building, and SCI validation ([repo](https://github.com/mobilecoinofficial/full-service)). See [Decision 4](./08_wallet_backend.md).

### Hot Wallet

A wallet whose keys are on an internet-connected server - required for automation, but the primary attack target.

### HTLC

Hash Time-Locked Contract - a conditional payment that automatically refunds if not claimed within a time window.

### Key Image

A one-time identifier derived from a spent output. Once published, the output cannot be spent again - this is how DEQS detects filled orders.

### Key Injection Attack

When a compromised server serves malicious JavaScript that intercepts private keys before they reach the WASM module.

### LedgerDB

Local copy of the MobileCoin blockchain (LMDB). Both mobilecoind and Full-Service maintain one.

### Liquidity

The availability of counterparties willing to trade at reasonable prices. Low liquidity = wide spreads and slow fills.

### wAsset

A wrapped token (wBTC, wETH) on MobileCoin. Distinguishes between native assets (MOB) and bridged assets.

### MEV

Miner/Maximal Extractable Value - profit extracted by reordering, inserting, or censoring transactions. Not possible on MobileCoin due to how SCIs work.

### Minting Key

The private key authorizing creation of new token supply on MobileCoin. Controlled via MintConfigTx ([MCIP 37](https://github.com/mobilecoinfoundation/mcips/blob/main/text/0037-mint-transactions.md)).

### mobilecoind

MobileCoin's original daemon providing blockchain sync and wallet services via gRPC. Used by Antelope. Can create SCIs server-side but cannot validate them. See [Decision 4](./08_wallet_backend.md).

### Monitor

mobilecoind's concept of a "watcher" - you register a key, and it tracks UTXOs for that key. One monitor per subaddress range.

### Non-Custodial

The server never sees the user's private key.

### Oracle

A trusted service that verifies events on one blockchain and provides cryptographic proof to another.

### Partial Fill

Filling only part of an order. Requires creating a new SCI for the remaining amount. See [Architecture Decisions](./02_architecture_decisions.md#3-partial-fill-mechanics).

### Ring Signatures

Privacy mechanism where the real input is mixed with decoy inputs, hiding the sender's identity. See [System Design](./01_system_design.md#4-ring-signatures-transaction-privacy).

### SCI

Signed Contingent Input - the core unit of trade. "Order" is a UI concept; SCI is the crypto object. See [System Design](./01_system_design.md#2-sci-the-trustless-swap-primitive).

### SGX Enclave

Intel's hardware-level trusted execution environment. Some MobileCoin components require it.

### Solver

The automated backend service that matches orders. Not a "Market Maker" (human) or "Relayer" (network).

### Spread

The gap between the best bid (buy) and best ask (sell) price.

### Tauri

A lighter alternative to Electron that uses the OS native webview instead of bundling Chromium. Produces much smaller binaries.

### Token ID

MobileCoin's on-chain identifier for a specific token type. Wrapped assets get their own IDs.

### Tombstone Block

A MobileCoin block height after which an SCI expires and can no longer be filled.

### TSS

Threshold Signature Scheme - cryptographic method where `k` out of `n` parties must collaborate to sign. No single party holds the full key.

### WASM

WebAssembly - allows running MobileCoin's Rust crypto libraries in the browser at near-native speed. See [System Design](./01_system_design.md#5-wasm-running-crypto-in-the-browser).
