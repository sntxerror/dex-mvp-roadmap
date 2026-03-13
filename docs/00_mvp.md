# MVP Roadmap

The scope, architecture, user stories, and sequential implementation plan for the **MobileCoin Web DEX MVP**.

"Dreamer's DEX" is a non-custodial, decentralized, peer-to-peer web application that allows users to hold and transfer MOB using the MobileCoin blockchain and later trade via SCI offers.

At MVP stage, the product is best described as a **private, non-custodial MobileCoin web based wallet with MOB send and receive flows**.

1. **Non-custodial by design**  
   User wallet secrets stay on the client in the browser and are encrypted locally. Private keys exist only in the browser, and hosted systems do not become wallet authorities.
2. **Web-first access**  
   The app works in a browser without requiring a desktop-native install. Fog is used for discovery, while transaction signing remains client-side
3. **Direct transfers**  
   Users can send real MOB assets wallet to wallet to any valid MobileCoin address.
4. **Balance discovery**  
   Users can sync balance and detect incoming funds through Fog.
5. **Reliable wallet**  
   The app can recover from refreshes, reconnects, and device changes without wallet loss.

It proves the foundational concept and software pieces first:

- full client-side key ownership
- browser-safe cryptography via WASM
- Fog-based balance discovery (public nodes)
- transaction construction and signing on the client
- safe transaction submission to the MobileCoin network
- an architecture and deployment model where hosted services do not become custodians

If this foundation works well, at later stages we can add SCI-based trading, order discovery, and eventually cross-chain flows.

Full DEX infrastructure can be built in three stages:

## Stage 1 - Wallet foundation

The goal is to ship the non-custodial wallet core. Create and recover/import wallet, view balance, receive MOB, send MOB, view activity/transaction history.

App setup consists of client React app with API to WASM wallet core and Fog access. Fog is essential in Stage 1.

## Stage 2 - SCI trading layer

At this stage we introduce exchange behavior on MobileCoin. Create **SCI offers**, publish orders, discover orders, monitor order state, partial fill prototype.

### DEQS

We will need `DEQS` for quote submission, discovery, live updates, and order distribution.

`DEQS` provides a decentralized quoting service for signed orders built around SCI-based trading. It supports order submission, order retrieval, streaming updates, P2P order gossip, and a local order database and it relies on a synced MobileCoin ledger in order to validate and prune orders.

### `Full-Service`

`Full-Service` is an official example of MobileCoin's backend and JSON-RPC service. It can manage accounts, sync the ledger, build and submit transactions, and expose wallet-oriented APIs. It also provides explicit SCI-related validation.

> still not the place to store user mnemonics or private keys if we promise  browser-native non-custodial control therefore needs WASM setup in place

## Stage 3 - Cross-chain trading

We extend DEX prototype beyond MobileCoin-native assets and add ETH/MOB or stablecoin/MOB settlement flows.

It will require our Stage 2 services to integrate with Ethereum-side smart contracts, watchers, and oracle components.

## Main components and responsibilities

### Frontend Web App

The user-facing single-page application for wallet management and MOB transfers with persistent local storage for encrypted wallet data (IndexedDB preferred)

**Responsibilities:**

- Render all UI screens (wallet creation, dashboard, send, receive, history)
- Orchestrate WASM calls for cryptographic operations
- Manage the encrypted keystore lifecycle (create, unlock, lock, export)
- Connect to the Fog Proxy for balance sync and transaction submission
- Parse and display transaction history from decrypted UTXO data

### WASM Crypto Engine

MobileCoin ecosystem mc-* libraries compiled to WebAssembly and combined within single API. Performs all MobileCoin cryptographic operations locally in the browser. Mnemonic handling, key derivation, address handling, transaction construction and signing. All sensitive data lives inside browser memory and private key authority stays client-side.

To confidently commit to full client side wallet implementation we should first make sure that total resulting WASM binary size is small and ring signature construction completes quickly in browser WASM. (see: "Phase 0: Proof of Concept")

The client-side cryptography performance is the biggest technical unknown right now and we should build a small draft app to verify whether the required MobileCoin Rust libraries are indeed working fine when compiled for a browser environment.

If full transaction signing and construction in browser proves impractical, we can use `Full-Service` as a complete wallet backend, but with some tradeoffs and compromises on privacy.

### Fog Proxy

Fog nodes let clients discover incoming outputs and current spendable state. Without Fog, the browser cannot efficiently know what funds belong to the user.

But at the same time browsers cannot make raw HTTP/2 gRPC calls, which MobileCoin nodes may require.

Before implementing Fog interaction we should validate whether direct browser submission is supported or Fog indeed requires ONLY a gRPC-requests. For now we assume that proxy *is* required and must never accept secrets or unsigned authority requests.

The Fog Proxy will simply translate gRPC-Web (HTTP/1.1 with base64-encoded protobuf) to native gRPC (HTTP/2 with binary protobuf).

- Does not inspect, decrypt, or cache any user data
- Does not store state — fully stateless
- Does not authenticate users — anyone with the frontend can use it
- Does not hold any MobileCoin keys

### Optional: TX Relay

A thin broadcast service that accepts already signed transaction payloads from the browser and forwards them to the MobileCoin network.

It becomes useful when direct browser submission is impractical, when request retries or fails are easier to manage server-side, or when we want to hide raw consensus endpoints.

If the browser can safely submit through the existing gRPC-web or proxy path, then a separate relay is unnecessary.

It must never accept mnemonics, private keys, or unsigned transaction-authority requests. Not a mandatory wallet component.

## Core MVP Features

The first release should include:

- wallet creation in the browser
- wallet import from mnemonic
- password-protected encrypted local keystore
- wallet unlock and re-lock flow
- balance sync through Fog
- receive address display and copy/share flow
- MOB send flow with validation and confirmation
- activity view for known incoming and outgoing transactions
- safe recovery after browser refresh or temporary connection loss
- restore on a new device from mnemonic
- session auto-lock and local wipe/reset capability
- recovery phrase reveal after password re-verification

The first release will not include:

- SCI creation or order publishing
- detailed exchange, liquidity, or market-making workflows
- cross-chain settlement logic (BTC, ETH, USDT, USDC, bridges, wrapping, or mint/burn systems)
- order discovery, order books, matching, or solver logic
- server-managed user accounts
- server-side key custody or mnemonic import
- native mobile or desktop apps in the first release

---

## High-Level Architecture Overview

If complete WASM implementation proves feasible, the MVP will use a client-heavy architecture where hosted infrastructure is limited to browser-compatible MobileCoin network access, and submission of already-signed payloads.

In this model, Fog is used for balance discovery, MobileCoin consensus remains the settlement layer, and no hosted component should ever become trusted with user secrets or unencrypted wallet data.


```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                       │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │      UI      │◄──►│   WASM Crypto Engine         │   │
│  │              │    |  (Rust → WebAssembly)        │   │
│  └──────┬───────┘    │  • Key derivation            │   │
│         │            │  • Tx building & signing     │   │
│         │            │  • UTXO decryption           │   │
│         │            │  • Ring signature            │   │
│         │            └──────────────────────────────┘   │
│         │                                               │
│  ┌──────┴───────┐                                       │
│  │  Encrypted   │  Keys encrypted with user password    │
│  │  Key Store   │  in localStorage / IndexedDB          │
│  └──────────────┘                                       │
└────────────┬────────────────────────────────────────────┘
             │ HTTPS (gRPC-Web / REST)
             ▼
┌────────────────────────┐
│   Fog / Network Proxy  │  Envoy or custom gateway
│   (gRPC-Web → gRPC)    │  Stateless, no user data
└────────────┬───────────┘
             │ gRPC (HTTP/2)
             ▼
┌───────────────────────────────────────────────┐
│            MobileCoin Network                 │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Fog View │  │ Fog Ledger │  │ Consensus │  │
│  │ Service  │  │  Service   │  │   Nodes   │  │
│  └──────────┘  └────────────┘  └───────────┘  │
└───────────────────────────────────────────────┘
```

[Next: Implementation Phases](10_implemetation_phases.md)
