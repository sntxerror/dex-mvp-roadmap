# Decision 1: Frontend Platform - Where Does the Cryptography Run?

## 1. The Problem

The DEX would require heavy cryptography on the client side: creating [SCIs](./09_glossary.md#sci), signing transactions, managing private keys, computing [ring signatures](./09_glossary.md#ring-signatures). These operations use **Ristretto255** elliptic curves - impossible to implement reliably in plain JavaScript. The question is where this code runs.

The choice affects everything downstream: distribution strategy, security posture, update mechanism, user onboarding friction, and what MobileCoin features we can access.

## 3. The Options

---

### Option A: Web Browser (WASM)

**Concept:** A standard website (React/Vite). The user visits `dex.dreamers.land`. MobileCoin's Rust crypto libraries are compiled to WebAssembly and loaded as a module. All key management and SCI creation happen inside the browser tab. Private keys never leave the user's machine.

**Architecture:**

| Layer | Technology | Responsibility |
| --- | --- | --- |
| UI | React 19, TypeScript | Order forms, charts, wallet display |
| Crypto Engine | Rust → [WASM](./09_glossary.md#wasm) (`mc-transaction-builder`, `mc-crypto-keys`) | SCI creation, transaction signing, key derivation |
| Key Storage | Browser `localStorage` (encrypted with user password) | Persist keys across sessions |
| Network | Fog gRPC (via `grpc-web`), REST to our backend | Balance queries, order submission |
| Hosting | Static files on S3/Cloudflare Pages | Zero server-side logic for the frontend |

**Advantages:**

- **Zero install.** Accessible to anyone with a link. No app store approval needed.
- **Instant updates.** Deploy new code → all users get it on next page load. No auto-updater complexity.
- **Familiar UX.** Users who've used Uniswap, dYdX, or any web DEX will feel at home.
- **Cross-platform for free.** Works on Windows, Mac, Linux, even mobile browsers (if WASM performance is sufficient).
- **Auditability.** WASM binaries can be verified against published Rust source via reproducible builds.

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **[Key injection attack](./09_glossary.md#key-injection-attack)** - if our CDN/server is compromised, malicious JS is served that steals keys before they reach WASM | High | Subresource Integrity (SRI) hashes, Content-Security-Policy headers, reproducible WASM builds, open-source frontend for community verification |
| **WASM performance** - Ristretto255 operations may be slower than native | Medium | Benchmark early. MobileCoin transactions are lightweight (~200ms on modern hardware). Not a blocker unless mobile is targeted. |
| **WASM compilation gap** - `mc-transaction-builder` has not been publicly compiled to WASM yet | High | P0 blocker. Must be proven before committing. If it fails, fall back to Option B. See [Open Questions](#6-open-questions) below. |
| **Browser storage** - `localStorage` can be cleared by user; no hardware-backed key storage | Low | Warn users to back up seed phrase. Optional: support hardware wallets (Ledger) via WebUSB/WebHID. |

**What we'd need to build:**

1. WASM compilation pipeline for MobileCoin Rust crates (`mc-transaction-builder`, `mc-crypto-keys`, `mc-fog-report-resolver`)
2. JavaScript ↔ WASM bridge layer (typed bindings via `wasm-bindgen`)
3. Encrypted key storage module (AES-256-GCM with PBKDF2-derived key from user password)
4. gRPC-web client for Fog communication
5. React frontend with order book UI, wallet management, trade history

---

### Option B: Desktop App (Electron or Tauri)

**Concept:** User downloads and installs an application (`.exe`, `.dmg`, `.AppImage`). The app bundles MobileCoin's Rust crypto as a native binary. Keys are stored on the local filesystem (encrypted).

**Architecture:**

| Layer | Technology | Responsibility |
| --- | --- | --- |
| UI | React (inside [Electron](./09_glossary.md#electron)/[Tauri](./09_glossary.md#tauri) webview) | Same order forms, charts, wallet display |
| Crypto Engine | Native Rust binary (not WASM) | SCI creation, transaction signing - full speed |
| Key Storage | OS keychain (macOS Keychain, Windows Credential Manager) or encrypted file | Hardware-backed where available |
| Network | Native gRPC (not limited to grpc-web) | Direct Fog connection, no proxy needed |
| Distribution | GitHub Releases, auto-updater (electron-updater / Tauri updater) | Signed binaries |

**Advantages:**

- **Stronger security posture.** Code is signed and verified at install time. No CDN compromise risk. Keys can use OS-level secure storage.
- **Full native performance.** No WASM overhead. Can use multithreading for syncing.
- **No WASM compilation uncertainty.** We use MobileCoin's Rust crates directly - no need to prove they compile to WASM.
- **Native gRPC.** Direct connection to Fog without needing a grpc-web proxy.
- **Hardware wallet support.** Direct USB access for Ledger/Trezor (no browser security sandbox restrictions).

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Install friction** - "Download and Install" kills conversion rates. Crypto users are suspicious of .exe files | High | Offer both web and desktop. Use Tauri (5-10MB) instead of Electron (150MB+) to reduce download size. |
| **Update friction** - users must update the app; lagging behind creates version fragmentation | Medium | Auto-updater with delta updates. Force minimum version via backend API check. |
| **Platform maintenance** - must build, sign, and test for Windows/Mac/Linux separately | Medium | CI/CD pipeline (GitHub Actions). Cross-compilation. But still ~3� -  the testing surface. |
| **App store policies** - Apple may reject or delay crypto-related apps | Low | Distribute via GitHub/website, not app stores. Tauri doesn't require app store distribution. |

**What we'd need to build:**

1. Electron or Tauri shell with React frontend
2. Native Rust crypto backend (linked as a sidecar binary or Tauri command)
3. Auto-update mechanism with code signing (Windows Authenticode, Apple Developer ID)
4. OS-level key storage integration
5. Installer packaging for 3 platforms
6. Same React UI as web version (shared component library)

---

## 4. Comparison

| Dimension | Web (WASM) | Desktop (Electron/Tauri) |
| --- | --- | --- |
| **Install friction** | None - visit a URL | Download + install + trust |
| **Update mechanism** | Automatic on page load | Auto-updater (can lag) |
| **Security model** | Trust the CDN/server on every visit | Trust once at install (signed binary) |
| **Key storage** | localStorage (software-only) | OS keychain (hardware-backed possible) |
| **Performance** | WASM (~80% of native) | Full native speed |
| **WASM risk** | Must prove mc-transaction-builder compiles | No risk - use Rust directly |
| **Platform coverage** | Any browser, any OS | Must build per-platform |
| **Distribution** | Link sharing, SEO | GitHub releases, word of mouth |
| **Maintenance** | One build target | Three build targets |
| **Mobile support** | Works (if WASM performs) | Separate mobile app needed |

## 5. Recommendation

**Option A (Web/WASM) for V1** - the zero-install experience is critical for adoption. Most successful DEXs (Uniswap, dYdX, Jupiter) are web-first.

**Contingency:** If the WASM compilation gap proves insurmountable (MobileCoin's Rust crates can't compile to WASM), pivot to Option B with Tauri. The React UI is shared between both - only the crypto backend layer changes.

**Hybrid path (V2):** Offer both. Web for casual users, desktop for power users who want OS-level key security. The shared React component library makes this feasible without doubling frontend work.

See [Proposed System Components](./04_system_components.md) for how the frontend fits into each architecture scenario and what services it connects to.

## 6. Open Questions

1. Can `mc-transaction-builder` compile to WASM? **(P0 - blocks this decision.)** Attempt compilation to `wasm32-unknown-unknown`, catalog all errors, and measure bundle size.
2. MobileCoin's Rust crypto uses `OsRng` for randomness - must be mapped to browser `crypto.getRandomValues()`. Does this work with `mc-crypto-ring-signature` and Bulletproofs?
3. `mc-fog-report-validation` makes network calls to Fog. In WASM, this goes through `fetch()` with CORS restrictions. Does `grpc-web` work with MobileCoin's Fog endpoints, or do we need an Envoy proxy?
4. What is the WASM bundle size? If >10MB, initial load time may hurt UX. Benchmark SCI creation time: WASM vs native Rust.
5. The `fog/sample-paykit` has `build_swap_proposal()` and `build_swap_transaction()` - might be the best compilation target instead of the full `mc-transaction-builder`. Evaluate.
6. Can we use WebHID/WebUSB for Ledger hardware wallet support in the browser?
7. **Fallback question:** If WASM compilation fails entirely, can [Full-Service](./09_glossary.md#full-service) serve as a local signing service (user runs it on their machine)?
