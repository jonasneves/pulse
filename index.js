// ── State ─────────────────────────────────────────────────────────────────
let activeTab       = 'github';
let githubData      = null;
let huggingfaceData = null;

// ── Elements ──────────────────────────────────────────────────────────────
const cardList     = document.getElementById('card-list');
const updatedLabel = document.getElementById('updated-label');

// ── Theme toggle ──────────────────────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const isDark  = current === 'dark' || (!current && !window.matchMedia('(prefers-color-scheme: light)').matches);
  const next    = isDark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('pulse-theme', next); } catch {}
});

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === activeTab) return;
    activeTab = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
      b.setAttribute('aria-selected', b.dataset.tab === activeTab);
    });

    renderCurrentTab();
    updateTimestamp();
  });
});

// ── Data loading ──────────────────────────────────────────────────────────
async function loadData() {
  const [gh, hf] = await Promise.allSettled([
    fetch('data/github.json').then(r => r.ok ? r.json() : null),
    fetch('data/huggingface.json').then(r => r.ok ? r.json() : null),
  ]);

  if (gh.status === 'fulfilled') githubData = gh.value;
  if (hf.status === 'fulfilled') huggingfaceData = hf.value;

  renderCurrentTab();
  updateTimestamp();
}

function updateTimestamp() {
  const data = activeTab === 'github' ? githubData : huggingfaceData;
  updatedLabel.textContent = data?.updated
    ? `updated ${new Date(data.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
}

// ── Card rendering ────────────────────────────────────────────────────────
function renderCurrentTab() {
  if (activeTab === 'github') {
    renderGitHubCards(githubData, cardList, handleCardSelect);
  } else {
    renderHFCards(huggingfaceData, cardList, handleCardSelect);
  }
}

function handleCardSelect(cardEl) {
  const isActive = cardEl.classList.contains('active');
  document.querySelectorAll('#card-list [data-rank]').forEach(c => c.classList.remove('active'));
  if (!isActive) cardEl.classList.add('active');
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` ${type}` : '');
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── WebMCP registration ───────────────────────────────────────────────────
let webmcpRegistered = 0;

function updateWebMCPBadge(registered) {
  const dot  = document.querySelector('.webmcp-dot');
  const text = document.getElementById('webmcp-status-text');
  webmcpRegistered = registered;
  if (dot)  dot.classList.toggle('connected', registered > 0);
  if (text) text.textContent = registered > 0 ? `WebMCP · ${registered} tools` : 'WebMCP · inactive';
}

function registerWebMCPTools() {
  if (!navigator.modelContext) {
    updateWebMCPBadge(0);
    return;
  }
  let count = 0;
  for (const t of TOOL_DEFS) {
    try {
      navigator.modelContext.registerTool({
        name: t.name,
        description: t.description,
        inputSchema: t.schema,
        execute: t.execute,
      });
      count++;
    } catch (e) {
      console.warn(`[WebMCP] Failed to register ${t.name}:`, e);
    }
  }
  updateWebMCPBadge(count);
}

// ── WebMCP tools dropdown ─────────────────────────────────────────────────
function initToolsPanel() {
  const btn      = document.getElementById('webmcp-btn');
  const dropdown = document.getElementById('webmcp-dropdown');
  const list     = document.getElementById('tools-list');
  const count    = document.getElementById('tools-count');
  if (!btn || !dropdown || !list) return;

  // Tool list
  TOOL_DEFS.forEach(t => {
    const item = document.createElement('div');
    item.className = 'tool-item';

    const badges = [];
    if (t.readOnlyHint)    badges.push('<span class="tool-ann read-only">read-only</span>');
    if (t.idempotentHint)  badges.push('<span class="tool-ann idempotent">idempotent</span>');
    if (t.destructiveHint) badges.push('<span class="tool-ann destructive">destructive</span>');

    item.innerHTML = `
      <div class="tool-item-header">
        <span class="tool-item-name">${t.name}</span>
        ${badges.join('')}
      </div>
      <div class="tool-item-desc">${t.description}</div>
    `;
    list.appendChild(item);
  });

  if (count) count.textContent = `${TOOL_DEFS.length} tools`;

  // Status footer — updated after registerWebMCPTools() runs
  const footer = document.createElement('div');
  footer.className = 'webmcp-footer';
  footer.id = 'webmcp-footer';
  dropdown.appendChild(footer);

  btn.addEventListener('click', () => {
    const open = dropdown.hidden;
    // Refresh footer each time the popover opens
    if (open) renderWebMCPFooter();
    dropdown.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('webmcp-wrap')?.contains(e.target)) {
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function renderWebMCPFooter() {
  const footer = document.getElementById('webmcp-footer');
  if (!footer) return;
  if (webmcpRegistered > 0) {
    footer.innerHTML = `<span class="webmcp-footer-active">&#x2713; ${webmcpRegistered} tools registered with browser AI context.</span>`;
  } else {
    footer.innerHTML = `To expose these tools to external agents, enable the browser flag:<br><code>chrome://flags/#webmcp-for-testing</code><br>Requires Chrome 146+ Canary.`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
initToolsPanel();
registerWebMCPTools();
loadData();
