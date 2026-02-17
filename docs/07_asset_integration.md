# Decision 3: Asset Integration - How Do Users Trade Non-MobileCoin Currencies?

## 1. The Problem

Users would come to the DEX to trade BTC, ETH, USDC, and USDT. But [SCIs](./01_system_design.md#2-sci-the-trustless-swap-primitive) only work within the MobileCoin ledger - they cannot directly reference Bitcoin or Ethereum transactions. A mechanism is needed to bring external assets into the MobileCoin ecosystem so they can participate in SCI-based trading.

This is arguably the hardest and most consequential decision in the project. It determines the security model, regulatory exposure, user experience, and engineering scope.

## 3. The Options

---

### Option A: Centralized Bridge (The "Vault" Model)

**Concept:** A single operator (us) runs the [bridge](./09_glossary.md#bridge). Users deposit real assets into our wallet, we mint wrapped tokens on MobileCoin, they trade on the DEX, and when they want to withdraw, they burn wrapped tokens and we release the real assets.

**This is the simplest and fastest path.** It is also the path with the highest regulatory and security risk.

#### How It Works

**Deposit flow:**

1. User provides their MobileCoin address. The bridge generates a unique Bitcoin deposit address for that session.
2. User sends BTC from any Bitcoin wallet.
3. The **Bitcoin Watcher** service detects the incoming transaction via self-hosted node or Mempool.space API.
4. After **6 block confirmations** (~60 minutes), the watcher triggers the minting process.
5. The **Asset Minter** holds the [minting key](./09_glossary.md#minting-key) for the `wBTC` [Token ID](./09_glossary.md#token-id). It creates a MintTx and submits it to MobileCoin.
6. Using **MCIP 53** (Mint to Fog), the minted wBTC arrives directly in the user's Fog-enabled wallet.

**Trading:** Once wrapped, all trading happens via SCIs within MobileCoin. wBTC/MOB, wETH/wUSDC - any pair. Settlement ~5 seconds. The bridge is not involved.

**Withdrawal flow:**

1. User sends wBTC to a designated burn address on MobileCoin.
2. The **Burn Detector** watches for transactions to that address.
3. The **BTC Sender** releases equivalent real BTC from the hot wallet to the user's Bitcoin address.
4. The wBTC supply decreases. The 1:1 peg is maintained.

#### Architecture

| Service | Technology | Responsibility |
| --- | --- | --- |
| **Bitcoin Watcher** | Python, Mempool.space REST/WS | Detect deposits, track confirmations, handle RBF invalidation |
| **Ethereum Watcher** | Python, Alchemy WebSocket | Detect ERC-20 transfers (USDC, USDT), handle reorgs up to 12 blocks |
| **Asset Minter** | Python/Rust, [`full-service`](./09_glossary.md#full-service) API | Hold minting key, create MintTx, mint to Fog addresses (MCIP 53) |
| **Burn Detector** | Python, MobileCoin block scanner | Detect burn transactions, extract user's withdrawal address |
| **BTC/ETH Sender** | Python, Bitcoin/Ethereum nodes | Send real assets from hot wallet to withdrawal addresses |

**Key management:** All keys (Bitcoin [hot wallet](./09_glossary.md#hot-wallet), Ethereum hot wallet, MobileCoin minting key) are held by a single operator. Should be stored in an HSM (Hardware Security Module), never in source code.

#### Antelope Reuse

If we fork Antelope (see [Architecture Decisions, Section 5](./02_architecture_decisions.md#5-codebase--order-book-antelope-fork-vs-from-scratch-deqs-vs-custom)):

| Antelope Component | How We Use It |
| --- | --- |
| Ethereum blockchain client (Web3, HD wallet, reorg-aware block processor) | Becomes the ETH/ERC-20 Watcher |
| MobileCoin blockchain client ([`mobilecoind`](./09_glossary.md#mobilecoind) gRPC wrapper) | Used by the Asset Minter |
| Worker pipeline (trigger-based background tasks) | Runs watchers and sender as workers |
| FastAPI + PostgreSQL + Docker | Backend framework for bridge API |

#### Security

| Threat | Impact | Mitigation |
| --- | --- | --- |
| Server compromise | Total fund loss (hot wallet + minting keys) | HSM for keys, minimal attack surface, strict firewall |
| Minting key theft | Unlimited token creation → wBTC becomes worthless | HSM storage, mint rate limits (max per hour/day), alerting |
| Bitcoin double-spend | Bridge losses (minted wBTC with no backing) | 6 confirmations minimum; more for large deposits |
| Insider threat | Total fund loss | 2-of-3 multi-sig even in centralized model, audit trails |

**If the bridge goes down:** Trading continues (existing [wAssets](./09_glossary.md#wasset) still work via SCIs). No new deposits or withdrawals. Users' wBTC is stuck until bridge recovers. Peg may break if confidence drops.

#### Regulatory Impact

- Operator holds and transmits user funds → likely classified as **money transmitter** (US FinCEN MSB, EU MiCA).
- KYC/AML probably required in regulated jurisdictions.
- Operator is legally liable for deposited funds.

---

### Option B: Federated Bridge (The "Consortium" Model)

**Concept:** Instead of a single operator, a group of independent entities (**[Guardians](./09_glossary.md#federation--guardians)**) collectively manage the bridge. Keys are split via threshold signatures - no single Guardian can mint tokens or release funds alone.

**This balances UX with security.** The user experience is identical to Option A (deposit → trade → withdraw), but trust is distributed across multiple parties.

#### How It Works

**Deposit flow:**

1. User sends BTC to a **Federation Address** - a Bitcoin multi-sig or Taproot address controlled by the Guardian group.
2. Each Guardian independently watches the Bitcoin blockchain. When they see the deposit and sufficient confirmations, they sign a "Mint Request."
3. When **k-of-n** signatures are collected (e.g., 3-of-5), the signatures are aggregated into a single valid MintTx.
4. The MobileCoin network accepts the MintTx and mints wBTC to the user's Fog-enabled address.

**Trading:** Identical to Option A - SCIs within MobileCoin.

**Withdrawal flow:**

1. User burns wBTC on MobileCoin.
2. Guardians detect the burn. Each signs a partial Bitcoin release transaction.
3. When k-of-n signatures are collected, the BTC transaction is submitted to the Bitcoin network.
4. User receives real BTC.

#### Architecture

| Service | Technology | Responsibility |
| --- | --- | --- |
| **Guardian Node** | Rust/Go/Python (high security) | Run on each Federation member's server. Watch Bitcoin + MobileCoin chains. Sign mint/release requests. Communicate with other Guardians via P2P. |
| **Coordinator / Aggregator** | Lightweight API | Collect partial signatures from Guardians, broadcast final transactions. Has no signing power - relay only. |
| **Bitcoin Multi-Sig** | P2SH or Taproot address | Federation-controlled Bitcoin vault. Requires k-of-n signatures to spend. |
| **MobileCoin Mint Config** | MintConfigTx (MCIP 37) + MCIP 55 (Nested Multi-Sigs) | Defines which public keys can authorize minting and under what threshold. |

**MCIP 55** (Nested Multi-Sigs) is critical here: it enables hierarchical signing, such as "Both our bridge operator (3-of-5 keys) AND MobileCoin Foundation (2-of-3 keys) must agree to mint."

**MCIP 53** (Mint to Fog) still applies - minted tokens go directly to the user's Fog-enabled wallet.

#### Guardian Selection

The security of this model depends entirely on the independence and trustworthiness of Guardians:

| Approach | Trust Assumption |
| --- | --- |
| Internal team (3-of-5 employees) | Low distribution - slightly better than centralized |
| Mixed (2 internal + 3 external partners) | Moderate - requires 1 external to collude |
| Fully external (5 community/institutional parties) | Best - operator cannot unilaterally mint or release |

**Minimum viable federation:** 3-of-5 with at least 2 external Guardians. This means an attacker must compromise 3 independent organizations to steal funds.

#### Security

| Threat | Impact | Mitigation |
| --- | --- | --- |
| Guardian collusion (k Guardians conspire) | Total fund theft | Distribute across independent, reputable entities. Geographic + jurisdictional diversity. |
| Individual Guardian compromise | No impact (needs k total) | Each Guardian uses HSM. Compromised Guardian can be rotated out. |
| Coordinator compromise | Cannot steal funds (no signing power) | Coordinator is stateless relay. Can be replaced. Multiple coordinators possible. |
| Guardian liveness failure (n-k+1 go offline) | Bridge freezes - no minting or withdrawals | Require sufficient redundancy. Alert on Guardian downtime. Users can still trade existing wAssets. |

#### Regulatory Impact

- Harder to classify as a single "VASP" (Virtual Asset Service Provider) if federation is truly decentralized and distributed across jurisdictions.
- Individual Guardians may still face regulatory obligations depending on their jurisdiction.
- More defensible position than Option A - no single entity controls user funds.

---

### Option C: Direct Atomic Swaps via Oracle (No Wrapping)

**Concept:** Users trade real BTC for real MOB by coordinating transactions on both chains simultaneously. No wrapped tokens exist. Since MobileCoin cannot read the Bitcoin blockchain directly, an **[Oracle](./09_glossary.md#oracle)** verifies external chain events and provides cryptographic proof.

**This is the "Holy Grail" of decentralized trading.** Zero custody, minimal regulatory risk - but the slowest UX and highest engineering complexity.

#### How It Works

1. **Maker** (has MOB, wants BTC) creates an SCI with a special condition: "These funds can be claimed ONLY if the claimant provides a signature from the Oracle proving that 1 BTC was sent to my Bitcoin address."
2. **Taker** (has BTC, wants MOB) sees the order and sends 1 BTC to the Maker's Bitcoin address on the Bitcoin network.
3. The **Oracle** monitors Bitcoin, verifies the transaction has sufficient confirmations (6 blocks), and signs an **attestation**: "Transaction X sending 1 BTC to address Y is confirmed."
4. The Taker submits the Oracle's attestation along with the Maker's SCI to MobileCoin. The SCI unlocks. Maker gets BTC, Taker gets MOB.

#### Safety: What If Something Goes Wrong?

The critical risk: the Taker sends BTC, but the Maker cancels the SCI (or the Oracle goes offline) before the Taker claims MOB. The Taker has now paid BTC and received nothing.

**Solution: [HTLCs](./09_glossary.md#htlc) on both chains.**

| Chain | Mechanism | Effect |
| --- | --- | --- |
| MobileCoin | **[Tombstone block](./09_glossary.md#tombstone-block)** in the SCI | SCI cannot be cancelled before the deadline, but expires automatically after it. Taker has a guaranteed window to claim. |
| Bitcoin | **HTLC script** | BTC is locked in a time-locked script. If not claimed by the Maker within the window, it automatically refunds to the Taker. |

**Timeline of a safe swap:**

```
T+0 min    Maker creates SCI (tombstone = current block + 100)
T+1 min    Taker sends BTC via HTLC (timeout = 4 hours)
T+60 min   Oracle confirms BTC tx (6 blocks)
T+61 min   Taker claims MOB using Oracle attestation
           - OR -
T+4 hours  If taker didn't claim: BTC auto-refunds, SCI expires
```

#### Architecture

| Service | Technology | Responsibility |
| --- | --- | --- |
| **Oracle Service** | Rust/Go, high-availability API | Query Bitcoin/Ethereum nodes, verify transactions, return signed attestations. Cannot steal funds - can only confirm or deny. |
| **Complex SCI Builder** | Rust → WASM (browser-side) | Construct SCIs with Ed25519 signature verification conditions (Oracle attestation check). Significantly more complex than standard SCIs. |
| **HTLC Manager** | Python/Rust | Generate and monitor HTLC scripts on Bitcoin. Track timeouts. Handle refund claims. |
| **Dual-Wallet UI** | React + WASM | Users need Bitcoin wallet + MobileCoin wallet open simultaneously. Guide them through the multi-step flow. |

#### Oracle Trust Model

The Oracle is the trust assumption in this system. Understanding its power and limitations:

| | |
| --- | --- |
| **What Oracle CAN do** | Confirm or deny a transaction happened. If it lies (confirms a non-existent tx), it enables a fraudulent MOB claim. |
| **What Oracle CANNOT do** | Steal funds directly. It has no keys to any wallet. It cannot create SCIs or sign Bitcoin transactions. |
| **If Oracle goes offline** | Swaps freeze (no attestations). Existing funds are safe - HTLCs refund automatically after timeout. |
| **If Oracle lies** | A false confirmation could enable fraud. Mitigate: run multiple Oracles requiring k-of-n agreement. Open-source the Oracle for audit. |

#### Regulatory Impact

- Minimal risk. The operator runs software that connects buyers and sellers - never holds or transmits funds.
- No custody, no money transmission.
- The Oracle is a notary service, not a financial intermediary.
- Most defensible legal position of all three options.

---

## 4. Comparison

| Dimension | Option A: Centralized Bridge | Option B: Federated Bridge | Option C: Atomic Swaps (Oracle) |
| --- | --- | --- | --- |
| **Implementation effort** | Low | Medium-High | High |
| **Time to market** | Fastest | Moderate | Slowest |
| **Settlement speed** | ~5 sec (on MobileCoin after wrapping; 60 min for initial BTC deposit) | Same as A | 10-60 min per swap (waiting for BTC confirmations each time) |
| **Security model** | Single point of failure | Distributed trust (k-of-n) | No custody at all |
| **What if operator disappears** | Users lose deposited funds | Federation continues operating | No impact - pure software |
| **Regulatory risk** | Highest (money transmitter) | Medium (distributed, harder to classify) | Lowest (no custody) |
| **UX** | Deposit once → trade many times → withdraw | Same as A | Both users online, slow, multi-step per swap |
| **Supports all trading pairs** | Yes (any wAsset pair) | Yes (any wAsset pair) | Only MOB↔BTC, MOB↔ETH (one external chain per swap) |
| **[Partial fills](./09_glossary.md#partial-fill)** | Yes (SCIs within MobileCoin) | Yes | Complex - each partial fill requires a new Oracle attestation cycle |
| **Order book compatibility** | Full (DEQS works identically) | Full | Limited (slow settlement conflicts with fast matching) |
| **Antelope reuse** | High (ETH client, workers, infra) | Moderate (same components + Guardian software) | Low (mostly new code) |

## 5. External Chain Monitoring Infrastructure

Options A and B both require watching Bitcoin and Ethereum for deposits. Option C requires the Oracle to verify transactions. All three need reliable chain monitoring.

### Bitcoin Monitoring

- **Primary: Mempool.space** (self-hosted) - Full REST + WebSocket API, built on electrs (Rust), privacy-preserving
  - Key endpoints: `GET /api/address/:address/utxo`, `WS track-address`, `GET /api/tx/:txid/status`
  - Self-hosting requires: bitcoind (~600GB), electrs (~30GB index)
- **Fallback: Blockstream Esplora** - Open source, Tor support, compatible API
- BTC confirmation requirement: **6 blocks (~60 minutes)**
- Must handle Replace-By-Fee (RBF) invalidation of unconfirmed transactions

### Ethereum + ERC-20 Monitoring

| Provider | Free Tier | Avg Latency | Cost (~5M req/mo) |
|----------|:---------:|:-----------:|:------------------:|
| **Alchemy** | 30M CUs/mo | 207ms | ~$180/mo |
| **QuickNode** | None ($49/mo start) | 86ms | ~$249/mo |
| **Infura** | 100K req/day | ~150ms | ~$225/mo |

- ERC-20 deposit detection via `eth_getLogs` filtering on `Transfer(address,address,uint256)` event
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` / USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- Confirmation requirement: **12-20 blocks (~3-5 minutes)**
- Must handle chain reorganizations (reorgs up to 12 blocks possible)

**Proposed architecture:** Self-hosted Mempool.space for BTC privacy + Alchemy WebSocket for ETH real-time + QuickNode as fallback.

## 6. Recommendation

**Option A (Centralized Bridge) for early MVP** - fastest path to live trading. Accept the regulatory risk for the initial small-scale launch.

**Transition to Option B (Federated Bridge) before scaling** - once the system is proven, onboard external Guardians to distribute custody. The user experience doesn't change. The deposit/trading/withdrawal flow is identical.

**Option C ([Atomic Swaps](./09_glossary.md#atomic-swap)) as a V2 feature** - offer alongside the bridge for users who prioritize trustlessness over speed. Not suitable as the primary trading method due to slow settlement.

**Progressive path:** A → B → A+C (bridge for fast trading, atomic swaps for trustless trading).

See [Proposed System Components](./04_system_components.md) for the full service inventory and how bridge services connect to the rest of the stack. For the bridge deposit/withdrawal sequence, see [Diagrams: Bridge Flow](./03_diagrams.md#bridge-flow).

## 7. Open Questions

### Token Creation (P0)

1. Can we get MobileCoin Foundation to approve new Token IDs for wBTC, wETH, wUSDC, wUSDT? What is the process and timeline? Contact them.
2. MCIP 37 defines `MintConfigTx` for token creation, but the operational process is unclear. Is it governance-gated?
3. Does MCIP 55 (Nested Multi-Sigs) work for MintConfigTx, or only for transfer transactions? **Critical for Option B (Federation).**
4. What token IDs are already claimed? Are there per-token minimum fees or constraints?
5. **To do:** Test `MintConfigTx` + `MintTx` flow on testnet with multi-sig configuration. Document token lifecycle: creation → configuration → minting → burning.

### Bridge Security

6. The bridge holds real BTC/ETH. A compromise of 3 keys = total loss. What's the maximum acceptable TVL per security tier?
7. Key ceremony: how are the 5 federation keys generated and distributed? Define HSM requirements and cost (minimum viable HSM setup).
8. Withdrawal timing: when a user burns wBTC, how quickly must the Bitcoin release happen? What if 2 of 5 Guardians are offline?
9. Liveness SLA: 3 Guardians must be online for any mint/withdrawal. What's the target uptime?
10. Is it possible/practical to insure bridged assets?
11. **To do:** Study existing bridge designs (tBTC, wBTC/BitGo, Ren, Threshold Network) for security best practices. Design key ceremony protocol. Design emergency procedures (key rotation, pause, emergency withdrawal).

### Bitcoin RBF Handling

12. RBF allows users to "cancel" unconfirmed Bitcoin transactions. If we mint wBTC after seeing an unconfirmed deposit, the user could RBF the deposit away and keep the wBTC. **Never mint before 6 confirmations.**
13. Even with 6 confirmations, deep chain reorgs (rare but possible) could invalidate deposits. Should we use variable confirmation thresholds based on deposit size?
14. Deposit address reuse: if a user sends multiple deposits to the same address, how do we attribute them correctly?
15. **To do:** Test RBF scenarios with Mempool.space monitoring. Verify WebSocket behavior during RBF events. Implement and test reorg detection in the bridge watcher.

### Ethereum Reorg Handling

16. Post-merge Ethereum has different finality guarantees. Using `eth_getBlockByNumber("finalized")` provides stronger guarantees but higher latency - test this on Alchemy.
17. `eth_getLogs` with large block ranges is expensive (75 CUs per call on Alchemy). If we re-scan after a reorg, costs could spike.
18. Multi-provider strategy (Alchemy + QuickNode) requires consistent block numbers. What if providers disagree?
19. **To do:** Implement and test reorg detection logic with synthetic test cases. Design provider failover logic with block consistency checks.

### Bridge Fees

20. Bridge fees: separate from trading fees? Per-mint, per-burn, or percentage-based?
21. Model bridge fee economics: operational costs (HSM, monitoring infra, Ethereum provider ~$180-250/mo, Bitcoin node ~630GB disk) vs. fee revenue.

### Other

22. Can MobileCoin SCIs support Ed25519 signature verification conditions (required for Option C Oracle attestations)?
23. Legal: does operating the bridge from a specific jurisdiction reduce regulatory burden?
24. What Guardian entities would be willing to participate in a federation?
25. Can we reuse Antelope's Ethereum block processor as-is for deposit detection, or does it need modifications?
