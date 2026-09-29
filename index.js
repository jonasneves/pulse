// ── Page state and actions (also driven by tools.js) ───────────────────────
const GAINS_TOP_N = 8;
// A longer span means a gap in observations, not a week of growth.
const GAINS_MAX_SPAN = 8;
const HISTORY_DAYS = 90;

const SOURCES = ['github', 'models', 'spaces'];
const isTab = t => t === 'all' || !!TABS[t];

const pulse = {
  activeTab: isTab(location.hash.slice(1)) ? location.hash.slice(1) : 'all',
  data: {},
  history: null,
  catalog: null,
  judgments: null,
  hideJudged: readPref('pulse-hide-judged', 'true') === 'true',

  judgment(tab, id) {
    return tab === 'github' ? this.judgments?.github?.[id] ?? null : null;
  },

  today() {
    return (this.history?.updated || SOURCES.map(s => this.data[s]?.updated).find(Boolean) || new Date().toISOString()).slice(0, 10);
  },

  groups() {
    return this.history ? crossSourceGroups(this.history, this.catalog || {}, this.today()) : [];
  },

  summarize(source, id) {
    const obs = this.history?.[source]?.[id];
    const g = obs ? growth(obs) : null;
    return { source, id, total: obs?.at(-1)?.v ?? null, gain: g ? { delta: g.delta, days: g.span } : null };
  },

  listItems(tab) {
    if (tab === 'all') {
      return {
        fastest: Object.fromEntries(SOURCES.map(s => [s, gainers(s).rows.slice(0, RISERS_PER_SOURCE).map(r => this.summarize(s, r.id))])),
        trackedSince: Object.fromEntries(SOURCES.map(s => [s, Object.values(this.history?.[s] || {}).map(o => o[0].d).sort()[0] ?? null])),
        groups: this.groups().map(g => ({
          hub: g.hub,
          members: g.members.map(m => this.summarize(m.source, m.id)),
          links: g.links.map(l => ({ from: l.a, to: l.b, why: LINK_REASONS[l.reason] })),
        })),
      };
    }
    const cfg = TABS[tab];
    const d = this.data[tab];
    if (!d) return { error: `No data for ${tab}` };
    return {
      updated: d.updated,
      metric: cfg.metric,
      sections: cfg.sections(d).map(s => ({
        title: s.title,
        items: s.items.map(it => {
          const id = cfg.id(it);
          const obs = this.history?.[tab]?.[id];
          const g = obs ? growth(obs) : null;
          const j = this.judgment(tab, id);
          return {
            rank: it.rank, id, url: it.url, description: it.description || null,
            total: obs?.at(-1)?.v ?? null,
            gain: g ? { delta: g.delta, days: g.span } : null,
            ...(j && { jev: { kind: j.kind, p: j.p, hiddenByDefault: !!hiddenKind(j) } }),
          };
        }),
      })),
    };
  },

  // Resolves once the new tab is on screen, so a caller can focus a row on it.
  showTab(tab) {
    if (!isTab(tab)) return Promise.resolve();
    if (tab === this.activeTab && rowsEl.childElementCount) return Promise.resolve();
    this.activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
    return transition(render);
  },

  // moveFocus: the pick came from a control that the re-render removed, so keyboard focus follows.
  focusItem(id, source, { moveFocus = false } = {}) {
    const bySource = source ? `[data-source="${CSS.escape(source)}"]` : '';
    const row = document.querySelector(`#rows [data-item-id="${CSS.escape(id)}"]${bySource}`);
    if (!row) return false;
    row.closest('details')?.setAttribute('open', '');
    document.querySelectorAll('#rows .row.focused').forEach(r => r.classList.remove('focused'));
    // Forcing a reflow between removal and re-adding restarts the arrival flash on a second pick.
    void row.offsetWidth;
    row.classList.add('focused');
    row.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    if (moveFocus) row.querySelector('.row-name')?.focus({ preventScroll: true });
    return true;
  },

  setHideJudged(hide) {
    this.hideJudged = !!hide;
    writePref('pulse-hide-judged', String(this.hideJudged));
    transition(render);
  },
};

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Crossfades the page between two states. `kind` lands on <html> as data-transition for the
// duration, so CSS can vary what is captured. Browsers without same-document view transitions,
// and readers who asked for reduced motion, get the new state at once.
function transition(update, kind = 'content') {
  if (!document.startViewTransition || reducedMotion() || document.hidden) {
    update();
    return Promise.resolve();
  }
  const root = document.documentElement;
  root.dataset.transition = kind;
  const vt = document.startViewTransition(update);
  // Resolving only once the crossfade is over: a smooth scroll started during it is cancelled.
  return vt.finished.finally(() => delete root.dataset.transition);
}

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

// ── Elements ──────────────────────────────────────────────────────────────
const rowsEl    = document.getElementById('rows');
const gainsEl   = document.getElementById('gains');
const updatedEl = document.getElementById('updated');
const hideBox   = document.getElementById('hide-judged');
const hideWrap  = document.getElementById('hide-judged-wrap');
const hideCount = document.getElementById('hide-judged-count');

// ── Render ────────────────────────────────────────────────────────────────
// A tab's listed items growing this week, fastest daily rate first.
function gainers(tab) {
  const cfg = TABS[tab];
  const data = pulse.data[tab];
  const hist = pulse.history?.[tab] || {};
  const rows = new Map();
  let hidden = 0;
  for (const item of data ? cfg.sections(data).flatMap(s => s.items || []) : []) {
    const id = cfg.id(item);
    const g = hist[id] ? growth(hist[id]) : null;
    if (rows.has(id) || !g || g.delta <= 0 || g.span > GAINS_MAX_SPAN) continue;
    if (pulse.hideJudged && hiddenKind(pulse.judgment(tab, id))) { hidden++; continue; }
    rows.set(id, { id, label: id, g });
  }
  return { rows: [...rows.values()].sort((a, b) => b.g.delta / b.g.span - a.g.delta / a.g.span), hidden };
}

function axisFor(today) {
  return { start: shiftDay(today, -(HISTORY_DAYS - 1)), days: HISTORY_DAYS - 1 };
}

function setUpdated(iso) {
  const updated = iso ? new Date(iso) : null;
  updatedEl.textContent = updated ? `Updated ${updated.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  updatedEl.dateTime = updated ? updated.toISOString() : '';
}

function render() {
  const tab = pulse.activeTab;
  document.documentElement.dataset.source = tab;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  placeTabIndicator();
  rowsEl.replaceChildren();
  gainsEl.replaceChildren();
  gainsEl.classList.remove('gains-trio');
  if (tab === 'all') renderAll(); else renderSource(tab);
}

function renderAll() {
  setUpdated(pulse.history?.updated);
  hideWrap.hidden = !pulse.judgments;
  hideBox.checked = pulse.hideJudged;
  const risers = Object.fromEntries(SOURCES.map(s => [s, gainers(s)]));
  hideCount.textContent = pulse.hideJudged && risers.github.hidden ? `${plural(risers.github.hidden, 'GitHub repo')} hidden` : '';
  if (!pulse.history) {
    rowsEl.innerHTML = `<p class="empty">No history yet. Run <code>node scripts/fetch.js</code> or the Fetch Trending Data workflow.</p>`;
    return;
  }
  const today = pulse.today();
  renderOverview({
    risers,
    groups: pulse.groups(),
    ctx: { history: pulse.history, catalog: pulse.catalog, axis: axisFor(today), today },
    gainsEl,
    rowsEl,
    onPick: (source, id) => pulse.showTab(source).then(() => pulse.focusItem(id, source, { moveFocus: true })),
  });
}

function renderSource(tab) {
  const cfg = TABS[tab];
  const data = pulse.data[tab];
  const hist = pulse.history?.[tab] || {};

  setUpdated(data?.updated);
  if (!data) {
    rowsEl.innerHTML = `<p class="empty">No ${cfg.label} data. Run <code>node scripts/fetch.js</code> or the Fetch Trending Data workflow.</p>`;
    hideWrap.hidden = true;
    return;
  }

  const today = (pulse.history?.updated || data.updated).slice(0, 10);
  const axis = axisFor(today);
  const judgmentModel = pulse.judgments?.model || 'Jev';

  let hiddenTotal = 0;

  // A tab whose history began this week has nothing to trace yet; say so once, not per row.
  const allItems = cfg.sections(data).flatMap(s => s.items || []);
  const firstObs = allItems.map(it => hist[cfg.id(it)]?.[0]?.d).filter(Boolean).sort()[0];
  const trackedSince = firstObs && daysBetween(firstObs, today) < 7
    ? `${cfg.metric} tracked since ${new Date(firstObs + 'T00:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
    : null;

  for (const section of cfg.sections(data)) {
    if (!section.items?.length) continue;
    const shown = [];
    const hidden = [];
    for (const item of section.items) {
      const id = cfg.id(item);
      const judgment = pulse.judgment(tab, id);
      const row = buildRow(item, { tab, history: hist, axis, judgment, judgmentModel, markNew: !trackedSince });
      (pulse.hideJudged && hiddenKind(judgment) ? hidden : shown).push(row);
    }
    hiddenTotal += hidden.length;

    const el = document.createElement('section');
    el.className = 'section';
    el.innerHTML = `<header class="section-head"><h2></h2><span class="section-note"></span></header>`;
    el.querySelector('h2').textContent = section.title;
    el.querySelector('.section-note').textContent = [
      section.note,
      `${section.items.length} items`,
      hidden.length && `${hidden.length} hidden by Jev, listed below`,
      trackedSince,
    ].filter(Boolean).join(' · ');
    const ol = document.createElement('ol');
    ol.className = 'rows';
    ol.append(...shown);
    el.appendChild(ol);

    if (hidden.length) {
      const det = document.createElement('details');
      det.className = 'hidden-rows';
      det.innerHTML = `<summary>${hidden.length} hidden by Jev as lists or courses</summary>`;
      const hol = document.createElement('ol');
      hol.className = 'rows';
      hol.append(...hidden);
      det.appendChild(hol);
      el.appendChild(det);
    }
    rowsEl.appendChild(el);
  }

  const judgedHere = tab === 'github' && cfg.sections(data).some(s => s.items.some(it => hiddenKind(pulse.judgment(tab, cfg.id(it)))));
  hideWrap.hidden = !judgedHere;
  hideBox.checked = pulse.hideJudged;
  hideCount.textContent = pulse.hideJudged && hiddenTotal ? `${hiddenTotal} hidden` : '';

  const { rows, hidden } = gainers(tab);
  renderGains(rows.slice(0, GAINS_TOP_N), gainsEl, {
    title: 'Fastest growing',
    note: `${cfg.metric} per day over the last 7 days, or since first seen${hidden ? ` · ${hidden} more hidden by Jev` : ''}`,
    metric: cfg.metric,
  }, id => pulse.focusItem(id, tab));
}

// The underline slides from the previously pressed tab to the new one.
function placeTabIndicator() {
  const pressed = document.querySelector('.tab[aria-pressed="true"]');
  const bar = document.querySelector('.tab-indicator');
  if (!pressed || !bar) return;
  bar.style.setProperty('--x', `${pressed.offsetLeft}px`);
  bar.style.setProperty('--w', `${pressed.offsetWidth}px`);
  // The first placement lands without sliding in from the left edge.
  if (!bar.classList.contains('placed')) requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('placed')));
}
window.addEventListener('resize', placeTabIndicator);
document.fonts?.ready.then(placeTabIndicator);

// ── Controls ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => pulse.showTab(b.dataset.tab)));
window.addEventListener('hashchange', () => pulse.showTab(location.hash.slice(1)));
hideBox.addEventListener('change', () => pulse.setHideJudged(hideBox.checked));

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const isDark = current ? current === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = isDark ? 'light' : 'dark';
  transition(() => { document.documentElement.dataset.theme = next; }, 'theme');
  writePref('pulse-theme', next);
});

// ── WebMCP status ─────────────────────────────────────────────────────────
function initAgentPanel(registered) {
  const btn = document.getElementById('agent-btn');
  const panel = document.getElementById('agent-panel');
  btn.querySelector('.agent-state').textContent = registered ? `${registered} agent tools` : 'Agent tools off';
  btn.classList.toggle('on', registered > 0);

  const status = panel.querySelector('.agent-status');
  status.textContent = registered
    ? `Registered with this browser through WebMCP. An agent working in this tab can call them.`
    : `This browser does not expose WebMCP (document.modelContext) to this page, so these tools are not registered.`;
  const list = panel.querySelector('.agent-tools');
  for (const t of TOOL_DEFS) {
    const li = document.createElement('li');
    li.innerHTML = `<code></code><span class="agent-kind"></span><p></p>`;
    li.querySelector('code').textContent = t.name;
    li.querySelector('.agent-kind').textContent = t.annotations.readOnlyHint ? 'reads' : 'changes view';
    li.querySelector('p').textContent = t.description;
    list.appendChild(li);
  }

  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.agent')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  });
}

// ── Load ──────────────────────────────────────────────────────────────────
async function load() {
  const get = f => fetch(`data/${f}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  const [github, models, spaces, hist, catalog, judgments] = await Promise.all(['github', 'models', 'spaces', 'history', 'catalog', 'judgments'].map(get));
  Object.assign(pulse.data, { github, models, spaces });
  pulse.history = hist;
  pulse.catalog = catalog;
  pulse.judgments = judgments;
  render();
}

registerWebMCPTools().then(initAgentPanel);
load();
