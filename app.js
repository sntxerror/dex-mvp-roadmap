// ─── Document content store ────────────────────────────────────────
const docs = {};

// ─── Load markdown from files (fetched relative to the html) ──────
const fileMap = {
  design:       'docs/01_system_design.md',
  arch:         'docs/02_architecture_decisions.md',
  diagrams:     'docs/03_diagrams.md',
  structure:    'docs/04_system_components.md',
  dec1:         'docs/05_frontend_platform.md',
  dec2:         'docs/06_matching_engine.md',
  dec3:         'docs/07_asset_integration.md',
  dec4:         'docs/08_wallet_backend.md',
  glossary:     'docs/09_glossary.md',
  research:     'docs/10_initial_research.md'
};

const pageNames = {
  design:       'System Design',
  arch:         'Architecture Decisions',
  diagrams:     'Diagrams',
  structure:    'Proposed System Components',
  dec1:         'Decision 1: Frontend Platform',
  dec2:         'Decision 2: Matching Engine',
  dec3:         'Decision 3: Asset Integration',
  dec4:         'Decision 4: Wallet Backend',
  glossary:     'Glossary',
  research:     'Initial Research'
};

let currentPage = 'design';
let diagramCounter = 0;

// ─── Mermaid init ─────────────────────────────────────────────────
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  flowchart: { htmlLabels: true, curve: 'basis' },
  sequence: { actorMargin: 50, messageMargin: 40 }
});

// ─── Markdown renderer with mermaid support ────────────────────────
const renderer = new marked.Renderer();

// Override code blocks to capture mermaid
renderer.code = function(obj) {
  let text, lang;
  if (typeof obj === 'object' && obj !== null) {
    text = obj.text;
    lang = obj.lang;
  } else {
    text = obj;
    lang = arguments[1];
  }
  
  if (lang === 'mermaid') {
    const id = 'inline-mermaid-' + (diagramCounter++);
    return buildDiagramHTML(id, 'Diagram', text);
  }
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const langClass = lang ? ` class="language-${lang}"` : '';
  return `<pre><code${langClass}>${escaped}</code></pre>`;
};

// ─── Heading ID generation (GitHub-compatible slugs) ────────────────
let headingSlugCounts = {};

function slugify(text) {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-');

  if (slug in headingSlugCounts) {
    headingSlugCounts[slug]++;
    slug += '-' + headingSlugCounts[slug];
  } else {
    headingSlugCounts[slug] = 0;
  }
  return slug;
}

renderer.heading = function(tokenOrText) {
  let depth, text, raw;
  if (typeof tokenOrText === 'object' && tokenOrText !== null && tokenOrText.depth) {
    depth = tokenOrText.depth;
    text = tokenOrText.tokens ? this.parser.parseInline(tokenOrText.tokens) : (tokenOrText.text || '');
    raw = tokenOrText.text || tokenOrText.raw || '';
  } else {
    text = tokenOrText;
    depth = arguments[1];
    raw = arguments[2] || text;
  }
  const cleanRaw = raw.replace(/<[^>]*>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
  const id = slugify(cleanRaw);
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};

marked.setOptions({ renderer: renderer, gfm: true, breaks: false });

// ─── Diagram HTML builder ─────────────────────────────────────────
function buildDiagramHTML(id, title, code) {
  return `<div class="diagram-container" id="container-${id}">
    <div class="diagram-toolbar">
      <span class="diagram-title">${title}</span>
      <button class="diagram-toggle active" onclick="showView('${id}', 'preview', this)">Preview</button>
      <button class="diagram-toggle" onclick="showView('${id}', 'code', this)">Code</button>
      <button class="diagram-toggle" onclick="toggleFullscreen('${id}')" title="Toggle fullscreen">&#x26F6;</button>
    </div>
    <div class="diagram-preview" id="preview-${id}">
      <div class="mermaid-placeholder" data-diagram-id="${id}">${code}</div>
      <div class="diagram-zoom-controls">
        <button class="diagram-zoom-btn" onclick="diagramZoomIn('${id}')" title="Zoom in">+</button>
        <button class="diagram-zoom-btn" onclick="diagramZoomOut('${id}')" title="Zoom out">&minus;</button>
        <button class="diagram-zoom-btn" onclick="diagramResetZoom('${id}')" title="Reset">&#8634;</button>
      </div>
    </div>
    <div class="diagram-code" id="code-${id}">
      <pre><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>
    </div>
  </div>`;
}

function showView(id, view, btn) {
  const container = document.getElementById('container-' + id);
  const preview = document.getElementById('preview-' + id);
  const code = document.getElementById('code-' + id);
  const buttons = container.querySelectorAll('.diagram-toggle');
  
  buttons.forEach(b => { if (b.textContent !== '\u26F6') b.classList.remove('active'); });
  btn.classList.add('active');
  
  if (view === 'preview') {
    preview.style.display = '';
    code.style.display = 'none';
    const pz = getPanZoom(id);
    if (pz) { pz.resize(); pz.fit(); pz.center(); }
  } else {
    preview.style.display = 'none';
    code.style.display = 'block';
  }
}

// ─── Zoom / Pan / Fullscreen (svg-pan-zoom) ──────────────────────
const panZoomInstances = {};

function getPanZoom(id) {
  return panZoomInstances[id] || null;
}

function diagramZoomIn(id) {
  const pz = getPanZoom(id);
  if (pz) pz.zoomIn();
}

function diagramZoomOut(id) {
  const pz = getPanZoom(id);
  if (pz) pz.zoomOut();
}

function diagramResetZoom(id) {
  const pz = getPanZoom(id);
  if (pz) { pz.resetZoom(); pz.resetPan(); pz.fit(); pz.center(); }
}

function toggleFullscreen(id) {
  const container = document.getElementById('container-' + id);
  const isFs = container.classList.toggle('fullscreen');
  if (isFs) {
    const sidebar = document.getElementById('sidebar');
    const collapsed = sidebar.classList.contains('collapsed');
    const mobile = window.innerWidth <= 768;
    container.style.left = (collapsed || mobile) ? '0' : 'var(--sidebar-width)';
  } else {
    container.style.left = '';
  }
  setTimeout(() => {
    const pz = getPanZoom(id);
    if (pz) { pz.resize(); pz.fit(); pz.center(); }
  }, 100);
}

// ─── Render mermaid diagrams ──────────────────────────────────────
async function renderMermaidDiagrams() {
  // Destroy existing svg-pan-zoom instances (page reload / theme change)
  for (const [id, pz] of Object.entries(panZoomInstances)) {
    try { pz.destroy(); } catch(e) {}
    delete panZoomInstances[id];
  }

  const placeholders = document.querySelectorAll('.mermaid-placeholder');
  for (const el of placeholders) {
    const id = el.getAttribute('data-diagram-id');
    const code = el.textContent;
    try {
      const { svg } = await mermaid.render('svg-' + id, code);
      el.innerHTML = svg;
      el.classList.remove('mermaid-placeholder');

      // Give the wrapper div explicit dimensions so svg-pan-zoom
      // can measure its container (same pattern as viewer.html)
      el.style.width = '100%';
      el.style.height = '100%';

      const svgEl = el.querySelector('svg');
      if (svgEl) {
        // Match viewer.html: just set style, do NOT remove attrs or override viewBox
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        svgEl.style.maxWidth = 'none';

        panZoomInstances[id] = svgPanZoom(svgEl, {
          zoomEnabled: true,
          controlIconsEnabled: false,
          panEnabled: true,
          fit: true,
          center: true,
          minZoom: 0.1,
          maxZoom: 10,
          zoomScaleSensitivity: 0.3
        });
      }
    } catch (e) {
      el.innerHTML = `<pre style="color:var(--danger);padding:12px;">Diagram render error: ${e.message}</pre>`;
    }
  }
}

// ─── Page loading ─────────────────────────────────────────────────
async function loadPage(page, anchor) {
  currentPage = page;
  diagramCounter = 0;
  headingSlugCounts = {};
  const contentEl = document.getElementById('content');
  
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-page') === page);
  });
  const pageName = pageNames[page] || page;
  document.getElementById('breadcrumb').innerHTML = `<span class="current">${pageName}</span>`;

  const file = fileMap[page];
  if (!file) {
    contentEl.innerHTML = '<p>Page not found.</p>';
    return;
  }

  try {
    let md;
    if (docs[page]) {
      md = docs[page];
    } else {
      const resp = await fetch(file);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      md = await resp.text();
      docs[page] = md;
    }
    contentEl.innerHTML = marked.parse(md);
    await renderMermaidDiagrams();
  } catch (e) {
    contentEl.innerHTML = `<h2>Error Loading Document</h2>
      <p>Could not load <code>${file}</code>: ${e.message}</p>
      <p>Make sure the markdown files are in the same directory as this HTML file, or serve via a local HTTP server.</p>
      <pre>python -m http.server 8000</pre>`;
  }
  
  if (anchor) {
    scrollToAnchor(anchor);
  } else {
    window.scrollTo(0, 0);
  }
}

// ─── Anchor scrolling ─────────────────────────────────────────────
function scrollToAnchor(anchor) {
  const id = anchor.replace(/^#/, '');
  const lowerID = id.toLowerCase();

  let target = document.getElementById(id);

  if (!target) {
    const allWithId = document.querySelectorAll('#content [id]');
    for (const el of allWithId) {
      if (el.id.toLowerCase() === lowerID) {
        target = el;
        break;
      }
    }
  }

  if (!target && lowerID.startsWith('section-')) {
    const stripped = lowerID.replace(/^section-/, '');
    const allWithId = document.querySelectorAll('#content [id]');
    for (const el of allWithId) {
      if (el.id.toLowerCase() === stripped) {
        target = el;
        break;
      }
    }
  }

  if (target) {
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

// ─── Event handlers ───────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const page = item.getAttribute('data-page');
    loadPage(page);
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  });
});

document.getElementById('menu-toggle').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
  }
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '\u263D' : '\u2600';
  mermaid.initialize({
    startOnLoad: false,
    theme: next === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });
  // Clear cached docs so mermaid re-renders with new theme
  for (const key in docs) delete docs[key];
  loadPage(currentPage);
});

// ─── SPA routing for in-content markdown links ────────────────────
const reverseFileMap = {};
for (const [key, file] of Object.entries(fileMap)) {
  reverseFileMap[file] = key;
}

document.getElementById('content').addEventListener('click', (e) => {
  const anchor = e.target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href) return;

  if (href.startsWith('#')) {
    e.preventDefault();
    scrollToAnchor(href);
    return;
  }

  const stripped = href.replace(/^\.?\//, '');
  const hashIdx = stripped.indexOf('#');
  const clean = hashIdx >= 0 ? stripped.substring(0, hashIdx) : stripped;
  const hash = hashIdx >= 0 ? stripped.substring(hashIdx) : null;

  const pageKey = reverseFileMap[clean] || reverseFileMap['docs/' + clean];
  if (pageKey) {
    e.preventDefault();
    if (pageKey === currentPage && hash) {
      scrollToAnchor(hash);
    } else {
      loadPage(pageKey, hash);
    }
    return;
  }
});

// ─── Initial load ─────────────────────────────────────────────────
loadPage('design');
