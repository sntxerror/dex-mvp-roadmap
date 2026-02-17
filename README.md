# MobileCoin DEX – Technical Proposal

A comprehensive design document exploring the architecture for a decentralized exchange (DEX) built on the MobileCoin blockchain. The documentation covers system design, architecture decisions, component mapping, and open questions — presented as an interactive single-page application with rendered Mermaid diagrams.

## View Online

**[View the documentation →](https://sntxerror.github.io/mc-dex-proposal/)**

No download required — just open the link.

## Run Locally

The docs are pure static files (HTML + JS + CSS + Markdown). No build step or dependencies to install — just a local HTTP server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

Then open [http://localhost:8000](http://localhost:8000).

> **Note:** Opening `index.html` directly as a file won't work — the app uses `fetch()` to load Markdown files, which requires an HTTP server.

## Document Structure

| # | Document | Description |
|---|----------|-------------|
| 01 | System Design | Core MobileCoin concepts: Fog, SCI, DEQS, Ring Signatures, WASM |
| 02 | Architecture Decisions | High-level decision areas with tradeoff summaries |
| 03 | Diagrams | All architectural diagrams in one place (rendered via Mermaid) |
| 04 | Proposed System Components | Concrete services mapped to each open decision |
| 05 | Decision 1: Frontend Platform | Web/WASM vs. Desktop (Electron/Tauri) |
| 06 | Decision 2: Matching Engine | Order Book + Solver vs. P2P vs. Hybrid |
| 07 | Decision 3: Asset Integration | Centralized Bridge vs. Federated vs. Atomic Swaps |
| 08 | Decision 4: Wallet Backend | mobilecoind vs. Full-Service |
| 09 | Glossary | 30 terms with anchored definitions, linked inline throughout |
| 10 | Initial Research | Raw research notes and external references |

## Status

This is a **proposal document**, not a decided architecture. Every section is written to present options and tradeoffs for team discussion. Nothing is committed to.

## Tech Stack (Viewer)

- [marked.js](https://marked.js.org/) — Markdown rendering
- [Mermaid.js v11](https://mermaid.js.org/) — Diagram rendering
- [svg-pan-zoom](https://github.com/bumbu/svg-pan-zoom) — Pannable/zoomable diagrams
- Vanilla HTML/CSS/JS — no framework, no build step
