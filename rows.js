/* ── Rows ─────────────────────────────────────────────────────────────────
   TABS describes each source: its data file, the metric history tracks,
   its sections, and the facts a row shows. buildRow() renders one item.
   ──────────────────────────────────────────────────────────────────────── */

// GitHub's own language colors, so a dot reads the way it does on github.com
const LANG_COLORS = {
  Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', Rust: '#dea584', Go: '#00ADD8',
  C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', Java: '#b07219', Ruby: '#701516', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c',
  'Jupyter Notebook': '#DA5B0B', Dockerfile: '#384d54', Lua: '#000080', Dart: '#00B4AB', Zig: '#ec915c',
  Elixir: '#6e4a7e', Nix: '#7e7eff', Vue: '#41b883', Svelte: '#ff3e00', MDX: '#fcb32c',
};

const PIPELINE_LABELS = {
  'text-generation': 'text generation', 'image-text-to-text': 'image + text → text', 'text-to-image': 'text → image',
  'image-to-video': 'image → video', 'text-to-video': 'text → video', 'text-to-speech': 'text → speech',
  'automatic-speech-recognition': 'speech recognition', 'feature-extraction': 'embeddings',
  'sentence-similarity': 'similarity', 'text-classification': 'classification', 'any-to-any': 'any → any',
};

const TABS = {
  github: {
    label: 'GitHub',
    metric: 'stars',
    sections: d => [{ title: 'Trending today', items: d.repos }],
    id: r => r.fullName,
    facts: r => [
      r.language && { html: `<span class="lang-dot" style="background:${LANG_COLORS[r.language] || 'var(--ink-3)'}"></span>`, text: r.language },
      { text: `${fmtCount(r.stars)} stars` },
      r.starsToday && { text: `${fmtSigned(r.starsToday)} stars today`, cls: 'fact-strong' },
    ],
  },
  models: {
    label: 'Models',
    metric: 'likes',
    sections: d => [
      { title: 'Trending', items: d.trending },
      { title: 'Small & distilled', note: 'trending text-generation models up to 8B, or distilled', items: d.small },
    ],
    id: m => m.id,
    facts: m => [
      m.pipelineTag && { text: PIPELINE_LABELS[m.pipelineTag] || m.pipelineTag.replace(/-/g, ' ') },
      { text: `${fmtCount(m.likes)} likes` },
      m.downloads > 0 && { text: `${fmtCount(m.downloads)} downloads / 30d` },
    ],
  },
  spaces: {
    label: 'Spaces',
    metric: 'likes',
    sections: d => [
      { title: 'Trending', items: d.trending },
      { title: 'WebML community', note: 'webml-community Spaces, by trending score', items: d.webml },
    ],
    id: s => s.id,
    facts: s => [
      s.sdk && { text: s.sdk },
      { text: `${fmtCount(s.likes)} likes` },
    ],
  },
};

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ctx: {tab, history, axis, judgment, judgmentModel, markNew}
function buildRow(item, ctx) {
  const tab = TABS[ctx.tab];
  const id = tab.id(item);
  const obs = ctx.history[id];
  const g = obs ? growth(obs) : null;

  const row = document.createElement('li');
  row.className = 'row';
  row.dataset.itemId = id;
  row.dataset.source = ctx.tab;
  row.dataset.rank = item.rank;

  const facts = tab.facts(item).filter(Boolean)
    .map(f => `<span class="fact ${f.cls || ''}">${f.html || ''}${escapeHtml(f.text)}</span>`).join('');

  const j = ctx.judgment;
  const kindLabel = j && (HIDDEN_KINDS[j.kind] || j.kind);
  const judged = j && j.kind !== 'project'
    ? `<span class="judged" title="Model output: ${escapeHtml(ctx.judgmentModel)} judged this repo a ${escapeHtml(kindLabel)} with probability ${j.p.toFixed(2)}">${escapeHtml(kindLabel)} · Jev p=${j.p.toFixed(2)}</span>`
    : '';

  const gain = g
    ? `<span class="gain-num">${fmtRate(g.delta / g.span)}<small>/day</small></span><span class="gain-span">${fmtSigned(g.delta)} in ${g.span}d</span>`
    : ctx.markNew ? `<span class="gain-span">new today</span>` : '';

  row.innerHTML = `
    <span class="row-rank">${item.rank}</span>
    <div class="row-main">
      <a class="row-name" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)}</a>
      ${item.description ? `<p class="row-desc">${escapeHtml(item.description)}</p>` : ''}
      <div class="row-facts">${facts}${judged}</div>
    </div>
    <div class="row-trace"></div>
    <div class="row-gain">${gain}</div>`;

  const trace = buildTrace(obs, ctx.axis);
  if (trace) row.querySelector('.row-trace').appendChild(trace);
  return row;
}
