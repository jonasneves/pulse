/* ── All sources ──────────────────────────────────────────────────────────
   The overview tab: each source's fastest growers side by side, each on its
   own scale because stars and likes are not the same unit, then groups of
   related items that span several sources (links.js).
   ──────────────────────────────────────────────────────────────────────── */

const SOURCE_NOUN = { github: 'repo', models: 'model', spaces: 'Space' };
const RISERS_PER_SOURCE = 5;

function plural(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// How `m` connects to the rest of its group, from its own point of view.
function relation(m, links) {
  const same = (x, y) => x.source === y.source && x.id === y.id;
  const phrases = links.flatMap(l => {
    const other = same(l.a, m) ? l.b : same(l.b, m) ? l.a : null;
    if (!other) return [];
    const noun = `${SOURCE_NOUN[other.source]} ${other.id}`;
    if (l.reason === 'uses') return [same(l.a, m) ? `uses ${noun}` : `used by ${noun}`];
    if (l.reason === 'base') return [same(l.a, m) ? `built on ${noun}` : `base of ${noun}`];
    return [`name matches ${noun}`];
  });
  return phrases;
}

// ctx: {history, catalog, axis, today}
function buildMemberRow(m, group, ctx) {
  const obs = ctx.history[m.source][m.id];
  const last = obs.at(-1);
  const g = growth(obs);
  const cat = ctx.catalog?.[m.source]?.[m.id] || {};
  const metric = TABS[m.source].metric;

  const row = document.createElement('li');
  row.className = 'row member';
  row.dataset.itemId = m.id;
  row.dataset.source = m.source;

  const listed = last.r != null && last.d === ctx.today;
  const lastRanked = g?.lastRanked;
  const status = listed ? `#${last.r} today` : lastRanked ? `left the list ${fmtDay(lastRanked)}` : '';
  const rels = m.id === group.hub.id && m.source === group.hub.source ? [] : relation(m, group.links);
  const rel = rels.length > 2 ? `${rels.slice(0, 2).join(' · ')} · ${rels.length - 2} more` : rels.join(' · ');
  // Following ends 30 days off the list, so a member's rate can describe a week long past.
  const stale = daysBetween(last.d, ctx.today) > 1;
  const gain = stale ? `<span class="gain-span">last observed ${fmtDay(last.d)}</span>`
    : g ? `<span class="gain-num">${fmtRate(g.delta / g.span)}<small>${metric}/day</small></span><span class="gain-span">${fmtSigned(g.delta)} in ${g.span}d</span>`
    : `<span class="gain-span">first seen ${fmtDay(obs[0].d)}</span>`;

  row.innerHTML = `
    <span class="row-source">${SOURCE_NOUN[m.source]}</span>
    <div class="row-main">
      <a class="row-name" href="${escapeHtml(PAGE_URL[m.source](m.id))}" target="_blank" rel="noopener noreferrer"></a>
      ${rel ? `<p class="row-rel"></p>` : ''}
      <div class="row-facts"><span class="fact">${fmtCount(last.v)} ${metric}${stale ? ` on ${fmtDay(last.d)}` : ''}</span>${status ? `<span class="fact${listed ? ' fact-strong' : ''}">${status}</span>` : ''}</div>
    </div>
    <div class="row-trace"></div>
    <div class="row-gain">${gain}</div>`;
  const name = row.querySelector('.row-name');
  name.textContent = m.id;
  if (cat.description) name.title = cat.description;
  if (rel) {
    const relEl = row.querySelector('.row-rel');
    relEl.textContent = rel;
    if (rels.length > 2) relEl.title = rels.join('\n');
  }

  const trace = buildTrace(obs, ctx.axis);
  if (trace) row.querySelector('.row-trace').appendChild(trace);
  return row;
}

const PAGE_URL = {
  github: id => `https://github.com/${id}`,
  models: id => `https://huggingface.co/${id}`,
  spaces: id => `https://huggingface.co/spaces/${id}`,
};

function fmtDay(d) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// risers: {[source]: {rows, hidden}}; groups from crossSourceGroups()
function renderOverview({ risers, groups, ctx, gainsEl, rowsEl, onPick }) {
  gainsEl.classList.add('gains-trio');
  for (const source of ['github', 'models', 'spaces']) {
    const { rows, hidden } = risers[source];
    const card = document.createElement('div');
    card.className = 'gains';
    card.dataset.source = source;
    const note = `${TABS[source].metric} per day, last 7 days or since first seen${hidden ? ` · ${hidden} hidden by Jev` : ''}`;
    renderGains(rows.slice(0, RISERS_PER_SOURCE), card, { title: TABS[source].label, note, metric: TABS[source].metric }, id => onPick(source, id));
    if (!rows.length) {
      // A source whose history began days ago has no week to measure yet; say when it will.
      const first = Object.values(ctx.history[source] || {}).map(o => o[0].d).sort()[0];
      card.innerHTML = `<div class="gains-head"><h2></h2><span></span></div><p class="gains-empty"></p>`;
      card.querySelector('h2').textContent = TABS[source].label;
      card.querySelector('span').textContent = `${TABS[source].metric} per day, last 7 days or since first seen`;
      card.querySelector('.gains-empty').textContent = first
        ? `Tracking ${TABS[source].metric} since ${fmtDay(first)}. Growth shows from the second day.`
        : `No ${TABS[source].label} data yet.`;
    }
    gainsEl.appendChild(card);
  }

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `<header class="section-head"><h2>Related across sources</h2><span class="section-note"></span></header>
    <p class="section-lede">A model with the models built on it and the Spaces that use them, joined by what Hugging Face lists for each, and repos joined by owner and a matching name. Each row says what links it.</p>`;
  section.querySelector('.section-note').textContent = plural(groups.length, 'group');
  if (!groups.length) {
    section.insertAdjacentHTML('beforeend', `<p class="empty">Nothing on the lists this week is related to an item on another source.</p>`);
  }
  for (const group of groups) {
    const el = document.createElement('article');
    el.className = 'group';
    const counts = ['github', 'models', 'spaces']
      .map(s => [s, group.members.filter(m => m.source === s).length])
      .filter(([, n]) => n)
      .map(([s, n]) => plural(n, SOURCE_NOUN[s]));
    el.innerHTML = `<header class="group-head"><h3></h3><span class="section-note"></span></header>`;
    el.querySelector('h3').textContent = group.hub.id;
    el.querySelector('.section-note').textContent = `${counts.join(' · ')} · ${group.listedToday} on a list today`;

    const order = m => (m.id === group.hub.id && m.source === group.hub.source ? -1 : ['github', 'models', 'spaces'].indexOf(m.source));
    const ol = document.createElement('ol');
    ol.className = 'rows';
    ol.append(...[...group.members].sort((a, b) => order(a) - order(b)).map(m => buildMemberRow(m, group, ctx)));
    el.appendChild(ol);
    section.appendChild(el);
  }
  rowsEl.appendChild(section);
}
