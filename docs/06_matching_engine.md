# Decision 2: Matching Engine - How Do Buyers and Sellers Find Each Other?

## 1. The Problem

A maker creates an [SCI](./09_glossary.md#sci) saying "sell 100 MOB for 0.01 wBTC." A taker wants to buy MOB. How does the taker discover this order? How does the system efficiently match partial fills across multiple makers? And who actually constructs and submits the final transaction?

The matching model defines the core UX of the exchange: does it feel like a professional trading platform (limit orders, order book depth, set-and-forget), or like a chat room where you paste codes at each other?

## 3. The Options

---

### Option A: Order Book with Solver Bot

**Concept:** Users sign SCIs (passive orders) and upload them to a centralized or semi-decentralized order book. A specialized bot (the **[Solver](./09_glossary.md#solver)**) continuously scans for [crossing orders](./09_glossary.md#crossing-orders) and executes trades by combining SCIs into settlement transactions.

**Architecture:**

| Component | Technology | Responsibility |
| --- | --- | --- |
| Order Book | [DEQS](./09_glossary.md#deqs) (Rust, gRPC) or custom (Python/Rust) | Store SCIs, validate signatures, remove filled orders via key-image monitoring |
| Solver Bot | Python or Rust service | Scan for crossing orders, construct multi-SCI transactions, submit to network |
| Discovery API | REST/WebSocket (FastAPI or gRPC) | Expose order book to frontend: live prices, depth chart, order status |
| Frontend | React + [WASM](./09_glossary.md#wasm) | Display order book, let users create SCIs, show trade history |

**How a trade flows:**

1. **Alice (Maker)** opens the web app, enters "Sell 100 MOB at 0.0001 wBTC/MOB", her browser creates an SCI (via WASM), and uploads it to the order book.
2. The order book validates the SCI (valid signature, inputs exist on-chain, no spent [key images](./09_glossary.md#key-image)) and stores it.
3. **Bob (Taker)** sees Alice's order on the order book. Two sub-paths:
   - **Manual Take:** Bob clicks "Fill", his browser downloads Alice's SCI, adds his own inputs (wBTC), signs, and submits the combined transaction.
   - **Solver Match:** The Solver detects Bob's opposing SCI crosses with Alice's. It combines both SCIs into one transaction and submits it.
4. MobileCoin consensus processes the transaction. Both parties receive their assets. The order book detects the spent key images and removes the filled orders.

**Advantages:**

- **Efficiency.** The Solver can match 1 large seller with 10 small buyers using partial fills. It can find best-price matches across the entire book.
- **Set and forget.** Users don't need to stay online after placing an order. The Solver executes when a match is found.
- **Professional UX.** Limit orders, order book depth, price charts, trade history - the experience traders expect.
- **Partial fill handling.** The Solver can automatically re-list remaining amounts after [partial fills](./09_glossary.md#partial-fill) (see [Architecture Decisions, Section 3](./02_architecture_decisions.md#3-partial-fill-mechanics)).
- **Liquidity aggregation.** All orders are visible in one place. New users can immediately trade against existing [liquidity](./09_glossary.md#liquidity).

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Centralization** - The Solver sees all orders (amounts and pairs, not identities) | Medium | [Ring signatures](./09_glossary.md#ring-signatures) hide who is trading. Multiple competing Solvers can run against the same DEQS. Open-source the Solver so anyone can verify fairness. |
| **Solver downtime** - If the Solver crashes, no automated matching occurs | Medium | Users can still manually take orders from the book. Run redundant Solver instances. Health monitoring and auto-restart. |
| **Front-running by Solver** - The Solver could theoretically insert its own orders before executing user orders | Low | MobileCoin's privacy makes this nearly impossible (the Solver doesn't know user identities). The Solver doesn't control consensus ordering. Verifiable execution logs. |
| **Key-image monitoring lag** - Stale orders that are already cancelled/filled could cause failed transactions | Medium | DEQS handles this with `SynchronizedQuoteBook`. If using a custom book, implement block-scanning worker to check key images every ~5 seconds. |
| **Order book visibility** - Competitors or adversaries can see all open orders (prices + amounts) | Low | This is inherent to any order book (CEX or DEX). Privacy is at the trader identity level, not the order level. Alternative: encrypted order book (see Option B). |

**What we'd need to build:**

1. **If using DEQS:** gRPC client wrapper, Solver bot that queries DEQS and constructs settlement transactions, REST API layer for frontend
2. **If custom order book:** SCI validation logic, key-image monitoring worker (block scanner), SQLite/PostgreSQL storage, P2P distribution (optional), plus the Solver
3. Solver matching algorithm (price-time priority, partial fill splitting)
4. WebSocket server for live order book updates to frontend
5. Trade history and settlement status tracking

---

### Option B: Pure Peer-to-Peer (OTC Experience)

**Concept:** No central order book. Users share SCIs directly - via chat, links, QR codes, or a simple bulletin board. The counterparty manually completes the swap. Think OTC trading desk, not stock exchange.

**Architecture:**

| Component | Technology | Responsibility |
| --- | --- | --- |
| SCI Sharing | Copy-paste, QR code, or link (e.g. `dex.dreamers.land/swap/abc123`) | Distribute the maker's SCI to potential takers |
| Bulletin Board (optional) | Simple REST API + database | List active SCIs for discovery. No matching logic - just a listing. |
| Frontend | React + WASM | Let maker create SCI, let taker complete it. No order book UI. |

**How a trade flows:**

1. **Alice** creates an SCI in her browser. The app generates a shareable link: `dex.dreamers.land/swap/abc123`.
2. Alice sends this link to Bob via Signal, Telegram, Twitter DM, or any channel.
3. **Bob** opens the link. His browser downloads Alice's SCI, adds his own inputs, signs, and submits.
4. Done. No intermediary ever saw the full picture.

**Advantages:**

- **Maximum privacy.** No server ever sees the order book. Only the two parties know about the trade.
- **Zero infrastructure.** No Solver to run, no order book to maintain, no key-image monitoring. The blockchain itself is the settlement layer.
- **Censorship resistant.** No server can block an order. SCIs are just data blobs that can be shared anywhere.
- **Simplicity.** Far less code. The "exchange" is just a UI for creating and filling SCIs.

**Risks & Mitigations:**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **No liquidity discovery** - How does a user find a counterparty? | Critical | Optional bulletin board. But without an order book, there's no price discovery, no depth, no market. |
| **Both parties must be online** - The taker must act while the SCI is still valid (key image not spent) | High | Longer SCI expiry windows (higher [tombstone blocks](./09_glossary.md#tombstone-block)). But this increases the risk of stale orders. |
| **No partial fills** - Each SCI is take-it-or-leave-it unless both users manually coordinate splitting | High | Users must negotiate amounts out-of-band. No automated splitting. |
| **Price discovery** - Without an order book, users don't know the "market price" | High | Show reference prices from external sources (CoinGecko, etc.). But users are trading blind relative to our own market. |
| **No professional UX** - No order book, no depth chart, no limit orders, no trade history | High | This is a feature-poor experience. Only suitable for users who prioritize privacy over convenience. |
| **Spam/scam** - On a bulletin board, anyone can post fake or stale SCIs | Medium | Validate SCIs on submission (check key images are live). Rate limiting. |

**What we'd need to build:**

1. SCI creation UI (WASM)
2. SCI sharing mechanism (link generator, QR code)
3. SCI completion UI (download SCI, add inputs, sign, submit)
4. Optional: bulletin board API (simple CRUD with SCI validation)

---

### Option C: Hybrid - Order Book + P2P Mode

**Concept:** The primary experience is Option A (order book with Solver), but power users can also create direct swap links for private OTC trades that bypass the public order book entirely.

**What this looks like:**

- Main UI: Full order book, depth chart, limit orders, Solver matching - the professional trading experience.
- Advanced mode: "Create Private Swap" button → generates a shareable link with an SCI. This order never appears on the public book.

This is the most flexible approach but requires building both systems.

---

## 4. Comparison

| Dimension | Order Book + Solver | Pure P2P | Hybrid |
| --- | --- | --- | --- |
| **Liquidity** | Aggregated - all orders visible | Fragmented - users must find each other | Aggregated + private option |
| **Price discovery** | Yes - order book shows market | No - users trade blind | Yes |
| **Partial fills** | Automated by Solver | Manual negotiation | Automated + manual |
| **UX** | Professional (limit orders, charts) | Minimal (paste code, fill) | Professional + private mode |
| **Privacy** | Orders visible (not identities) | Maximum - no one sees orders | User chooses per-trade |
| **Infrastructure** | Order book + Solver + monitoring | Nearly zero | Full + private swap feature |
| **User must be online** | No (set and forget) | Yes (both parties) | No (public) / Yes (private) |
| **Implementation effort** | Medium-High | Low | High |

## 5. Recommendation

**Option A (Order Book + Solver) for V1** - liquidity aggregation and professional UX are essential for attracting traders. Without price discovery and an order book, the exchange is unusable for most users.

**V2 addition:** Add private swap links (Option C hybrid) as an advanced feature. This is a natural extension since the SCI creation flow already exists - we just need a "don't publish to order book" flag and a link generator.

**DEQS vs. Custom:** Start with DEQS. It handles SCI validation, key-image monitoring, and storage out of the box. Only build a custom order book if DEQS proves too rigid (e.g., can't support multi-leg matching or custom sorting).

See [Proposed System Components](./04_system_components.md) for how the Solver, DEQS, and API Gateway connect. For visual comparison of manual vs. automated matching, see [Manual Matching](./03_diagrams.md#manual-matching) and [Automated Solver Matching](./03_diagrams.md#automated-solver-matching).

## 6. Open Questions

### Matching Engine Feasibility

1. Can DEQS handle our expected order volume? Deploy on testnet with 1K/10K/100K quotes and measure resource consumption.
2. The Solver must add its own input to pay network fees - it needs a funded MobileCoin wallet. How do we keep it funded? What happens if it runs out?
3. Can the Solver combine two users' SCIs into a single valid transaction? Build a testnet proof-of-concept: two users create SCIs, the Solver combines them using `TransactionBuilder::add_presigned_input()` called multiple times.
4. MCIP 57 relaxes mixin uniqueness, but does the current consensus code fully support multi-SCI transactions? Verify.
5. How does the Solver handle simultaneous partial fills on the same SCI? One partial fill per SCI means two buyers on the same order = two separate transactions. Measure the race condition window.
6. How do we display order book depth when ring signatures make it impossible to attribute volume to specific traders?

### Fee Model

7. MobileCoin transaction fees are paid in MOB. Who pays: Maker, Taker, or Solver?
8. If the Solver pays fees, it needs revenue. Can SCI `required_outputs` include a fee output to the DEX operator? The DEQS source has a TODO: "doesn't currently take into account the scenario where we would also want a fee output to pay the DEQS."
9. Calculate minimum viable Solver revenue based on MobileCoin transaction fees and expected volume.
10. Analyze competing DEX fee models (Uniswap, dYdX, Serum) for reference.

### Liquidity Bootstrap

11. An empty order book has zero utility. How do we bootstrap initial liquidity for launch?
12. The DEQS includes a `liquidity-bot` crate - study it for market-making strategies. Can it be used directly?
13. Partial fills help (one large order serves many small takers), but the maker must re-list after each fill. Can Auto-Relist keep a maker's order alive without manual intervention?
14. Cross-pair liquidity: if MOB/wBTC and MOB/wUSDC both have liquidity, can we offer a synthetic wBTC/wUSDC pair routed through MOB?
