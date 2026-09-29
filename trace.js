/* ── Trace + gains ────────────────────────────────────────────────────────
   buildTrace(): one item's history as an SVG line on the tab's shared date
   axis, so rows line up in time. Solid where the item was on its list that
   day, dotted where it was only followed. Y is scaled per row: the trace
   shows shape, the gain column shows size.
   renderGains(): the tab's largest 7-day gains as plain HTML bars.
   ──────────────────────────────────────────────────────────────────────── */

const TRACE_W = 240;
const TRACE_H = 28;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// axis: {start, days} — the tab's first day and its length in days
function buildTrace(obs, axis) {
  if (!obs || obs.length < 2) return null;
  const values = obs.map(o => o.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A floor of 2% of the total keeps a change of a few likes from drawing as a cliff.
  const range = Math.max(max - min, max * 0.02, 1);
  const x = d => (daysBetween(axis.start, d) / axis.days) * (TRACE_W - 4) + 2;
  const y = v => 3 + (TRACE_H - 6) * (1 - (v - min) / range);

  const svg = svgEl('svg', { class: 'trace', viewBox: `0 0 ${TRACE_W} ${TRACE_H}`, preserveAspectRatio: 'none', role: 'img' });

  // Consecutive observations with the same listed/followed state form one segment.
  let seg = [obs[0]];
  const flush = listed => {
    if (seg.length < 2) return;
    const d = seg.map((o, i) => `${i ? 'L' : 'M'}${x(o.d).toFixed(1)},${y(o.v).toFixed(1)}`).join('');
    svg.appendChild(svgEl('path', { d, class: listed ? 'trace-listed' : 'trace-followed' }));
  };
  for (let i = 1; i < obs.length; i++) {
    const listed = obs[i].r != null;
    seg.push(obs[i]);
    if (i === obs.length - 1 || (obs[i + 1].r != null) !== listed) {
      flush(listed);
      seg = [obs[i]];
    }
  }
  const last = obs.at(-1);
  svg.appendChild(svgEl('circle', { cx: x(last.d).toFixed(1), cy: y(last.v).toFixed(1), r: 2.2, class: 'trace-end' }));

  const listedDays = obs.filter(o => o.r != null).length;
  const title = svgEl('title', {});
  title.textContent = `${fmtCount(obs[0].v)} → ${fmtCount(last.v)} from ${obs[0].d} to ${last.d}; on the list ${listedDays} of ${obs.length} observed days`;
  svg.appendChild(title);
  return svg;
}

// rows: [{id, label, g}] already sorted
function renderGains(rows, container, metric, hiddenCount, onPick) {
  container.replaceChildren();
  if (!rows.length) return;
  const max = Math.max(...rows.map(r => r.g.delta / r.g.span));

  const head = document.createElement('div');
  head.className = 'gains-head';
  const hiddenNote = hiddenCount ? ` · ${hiddenCount} more hidden by Jev` : '';
  head.innerHTML = `<h2>Fastest growing</h2><span>${metric} per day over the last 7 days, or since first seen${hiddenNote}</span>`;
  container.appendChild(head);

  const list = document.createElement('ol');
  list.className = 'gains-list';
  for (const r of rows) {
    const rate = r.g.delta / r.g.span;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gain-bar';
    btn.style.setProperty('--w', `${Math.max(2, (rate / max) * 100)}%`);
    btn.title = `${fmtSigned(r.g.delta)} ${metric} from ${r.g.from} to ${r.g.to}`;
    btn.innerHTML = `<span class="gain-bar-name"></span><span class="gain-bar-fill" aria-hidden="true"></span><span class="gain-bar-value">${fmtSigned(Math.round(rate))}/d${r.g.span < 7 ? ` · ${r.g.span}d` : ''}</span>`;
    btn.querySelector('.gain-bar-name').textContent = r.label;
    btn.addEventListener('click', () => onPick(r.id));
    li.appendChild(btn);
    list.appendChild(li);
  }
  container.appendChild(list);
}
