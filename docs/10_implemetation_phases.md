
# Implementation Phases

## Phase 0: Client-side TX Signing - Proof of concept

The goal is to validate that the critical MobileCoin Rust crates can compile to WASM and run correctly in a browser environment. This remains the single biggest technical risk in the project. If this fails, the architecture must change.

Key deliverables:

1. A minimal Rust crate wrapping `mc-account-keys` and `bip39`, compiled with `wasm-pack`
2. A test page that loads the WASM module and:
   - generates a mnemonic
   - derives a MobileCoin key pair
   - outputs a B58 public address
3. Verification that the generated address matches official MobileCoin tooling
4. Measurement of WASM binary size and initialization time
5. Documentation of incompatibilities, required patches, or required support layers

Done when:

- a browser page generates a valid MobileCoin address from a mnemonic and matches official tool output
- binary size and init time are documented and acceptable enough to continue
- the team knows whether the WASM-first architecture is feasible or whether fallback planning is required

## Phase 1: Project skeleton

The goal is to set up the monorepo, configure the core tooling, and establish the development environment.

Key deliverables:

1. Monorepo structure for frontend and wallet-core work
2. Vite configured to load WASM modules
3. Local proxy setup pointing at MobileCoin testnet
4. CI pipeline for lint, test, and build

Done when:

- the frontend starts locally
- the WASM module loads in development
- the proxy reaches MobileCoin testnet endpoints

## Phase 2: Key management and wallet screens

The goal is to implement wallet creation, import, unlock, and the encrypted keystore.

Key deliverables:

1. WASM bindings for:
   - `generateMnemonic()`
   - `deriveKeys(mnemonic)`
   - `validateMnemonic(mnemonic)`
2. Keystore module for encrypt, decrypt, persist, lock, unlock, and existence checks
3. Core UI screens:
   - welcome screen
   - create-wallet flow
   - import-wallet flow
   - unlock screen
4. Auto-lock timer behavior

Done when:

- a user can create a wallet, see the resulting address, close the browser, reopen it, unlock with a password, and return to the same wallet
- mnemonic confirmation cannot be skipped

## Phase 3: Fog sync and balance display

Connect to MobileCoin testnet through the chosen browser-safe access path and display a live MOB balance.

Key deliverables:

1. gRPC-web client setup and required protocol bindings
2. Fog sync loop that:
   - fetches encrypted outputs
   - decrypts them locally
   - builds the local spendable set
   - checks spent state
   - computes total balance
   - persists sync progress
3. Dashboard UI for:
   - balance display
   - sync status
   - public address display
   - QR code and copy action
4. Incremental sync on subsequent unlocks

Done when:

- test MOB sent to the wallet is discovered and reflected in the browser within an acceptable sync window
- subsequent unlocks resume from stored sync state rather than starting over from scratch

## Phase 4: Send transaction

Build, sign, and submit a MobileCoin transaction entirely from the browser.

Key deliverables:

1. WASM transaction builder binding
2. Ring member fetching for decoys
3. Fee estimation and user-facing fee display
4. Transaction submission and confirmation polling
5. Send form UI with:
   - recipient validation
   - amount validation
   - confirmation dialog
   - pending and confirmed states
   - error handling for failure modes
6. Post-send reconciliation of local state and balance

Done when:

- a user can send MOB from the browser wallet on testnet to another wallet
- sender and recipient outcomes are reflected correctly
- the app handles tombstone expiry, retries, and state reconciliation safely

## Phase 5: Transaction history and UX polish

Build activity history, improve error handling, and make the wallet trustworthy for repeated use.

Key deliverables:

1. Transaction history for incoming and outgoing activity
2. Loading states, notifications, and network-error handling
3. Settings flows for:
   - recovery phrase reveal
   - auto-lock timeout changes
   - wallet wipe/reset
4. Security hardening including:
   - CSP and hosted-surface review
   - WASM integrity protection
   - memory clearing / zeroing behavior
   - avoiding secret leakage in logs

Done when:

- the complete user journey works end to end on testnet
- error states are understandable and safe
- restore, lock, unlock, send, and activity flows feel trustworthy rather than fragile

## Phase 6: Mainnet deployment

Move from testnet to mainnet, deploy production infrastructure, and prepare launch.

Key deliverables:

1. Mainnet endpoint configuration and environment separation
2. Production deployment of the static frontend and network-access components
3. Monitoring for uptime, error rate, latency, and sync health
4. Final security review and operational readiness checks
5. Basic user guidance for production use

Done when:

- the app can be operated as a real hosted non-custodial wallet service
- a user can create a wallet, receive real MOB, and send it successfully on mainnet

## Phase 7: SCI support and order discovery

After the wallet foundation is proven, extend the product into a first exchange-capable MobileCoin-native flow.

Key deliverables:

1. Client-side SCI creation support
2. order submission and discovery flows
3. `DEQS` integration for order storage and retrieval
4. `Full-Service` or equivalent ledger-aware backend support for SCI validation and operations
5. Basic order lifecycle states such as open, taken, cancelled, and expired

Done when:

- a user can create an SCI offer, publish it, and another user can discover it through the app

## Phase 8: Cross-chain exchange

Cross-chain trading introduces a second execution environment and a new trust boundary, so it should remain post-MVP.

Key deliverables:

1. Ethereum-side settlement and locking design
2. Oracle or attestation strategy
3. Watchers or indexers for cross-chain settlement state
4. ETH/MOB and stablecoin/MOB exchange architecture that preserves the non-custodial model
5. UI flows for cross-chain offers, discovery, and settlement

[Next: User Journeys](20_user_journeys.md)
