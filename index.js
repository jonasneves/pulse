// ── Page state and actions (also driven by tools.js) ───────────────────────
const GAINS_TOP_N = 8;
// A longer span means a gap in observations, not a week of growth.
const GAINS_MAX_SPAN = 8;
const HISTORY_DAYS = 90;

const pulse = {
  activeTab: TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'github',
  data: {},
  history: null,
  judgments: null,
  hideJudged: readPref('pulse-hide-judged', 'true') === 'true',

  judgment(tab, id) {
    return tab === 'github' ? this.judgments?.github?.[id] ?? null : null;
  },

  listItems(tab) {
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

  showTab(tab) {
    if (!TABS[tab]) return;
    this.activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
    render();
  },

  focusItem(id) {
    const row = document.querySelector(`#rows [data-item-id="${CSS.escape(id)}"]`);
    if (!row) return false;
    row.closest('details')?.setAttribute('open', '');
    document.querySelectorAll('#rows .row.focused').forEach(r => r.classList.remove('focused'));
    row.classList.add('focused');
    row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    return true;
  },

  setHideJudged(hide) {
    this.hideJudged = !!hide;
    writePref('pulse-hide-judged', String(this.hideJudged));
    render();
  },
};

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
function render() {
  const tab = pulse.activeTab;
  const cfg = TABS[tab];
  const data = pulse.data[tab];
  const hist = pulse.history?.[tab] || {};

  document.documentElement.dataset.source = tab;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));

  const updated = data?.updated ? new Date(data.updated) : null;
  updatedEl.textContent = updated ? `Updated ${updated.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  updatedEl.dateTime = updated ? updated.toISOString() : '';

  rowsEl.replaceChildren();
  gainsEl.replaceChildren();
  if (!data) {
    rowsEl.innerHTML = `<p class="empty">No ${cfg.label} data. Run <code>node scripts/fetch.js</code> or the Fetch Trending Data workflow.</p>`;
    hideWrap.hidden = true;
    return;
  }

  const today = (pulse.history?.updated || data.updated).slice(0, 10);
  const axis = { start: shiftDay(today, -(HISTORY_DAYS - 1)), days: HISTORY_DAYS - 1 };
  const judgmentModel = pulse.judgments?.model || 'Jev';

  const gainRows = new Map();
  let hiddenTotal = 0;
  let hiddenGainers = 0;

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
      const g = hist[id] ? growth(hist[id]) : null;
      const gains = g && g.delta > 0 && g.span <= GAINS_MAX_SPAN;
      if (pulse.hideJudged && hiddenKind(judgment)) {
        hidden.push(row);
        if (gains) hiddenGainers++;
        continue;
      }
      shown.push(row);
      if (gains && !gainRows.has(id)) gainRows.set(id, { id, label: id, g });
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

  const top = [...gainRows.values()].sort((a, b) => b.g.delta / b.g.span - a.g.delta / a.g.span).slice(0, GAINS_TOP_N);
  renderGains(top, gainsEl, cfg.metric, hiddenGainers, id => pulse.focusItem(id));
}

// ── Controls ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => pulse.showTab(b.dataset.tab)));
window.addEventListener('hashchange', () => pulse.showTab(location.hash.slice(1)));
hideBox.addEventListener('change', () => pulse.setHideJudged(hideBox.checked));

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const isDark = current ? current === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = isDark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
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
  const [github, models, spaces, hist, judgments] = await Promise.all(['github', 'models', 'spaces', 'history', 'judgments'].map(get));
  Object.assign(pulse.data, { github, models, spaces });
  pulse.history = hist;
  pulse.judgments = judgments;
  render();
}

registerWebMCPTools().then(initAgentPanel);
load();
