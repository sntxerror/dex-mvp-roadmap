# MobileCoin DEX – MVP Proposal

## View Online

**[View the documentation →](https://sntxerror.github.io/mc-dex-proposal/)**

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

## Status

This is a **proposal document**, not a decided architecture. Every section is written to present options and tradeoffs for team discussion. Nothing is committed to.

## Tech Stack (Viewer)

- [marked.js](https://marked.js.org/) — Markdown rendering
- [Mermaid.js v11](https://mermaid.js.org/) — Diagram rendering
- [svg-pan-zoom](https://github.com/bumbu/svg-pan-zoom) — Pannable/zoomable diagrams
- Vanilla HTML/CSS/JS — no framework, no build step
