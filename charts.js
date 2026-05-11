/* ── Charts ───────────────────────────────────────────────────────────────
   Defines renderVelocityChart(historyMap, container, opts) and
   buildSparkline(observations, opts).
   ECharts is loaded via CDN in index.html; sparklines use plain SVG so we
   don't spin up a chart instance per card.
   ──────────────────────────────────────────────────────────────────────── */

const VELOCITY_TOP_N = 10;

function themeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    text:   s.getPropertyValue('--text').trim()       || '#e6edf3',
    muted:  s.getPropertyValue('--text-muted').trim() || '#8b949e',
    accent: s.getPropertyValue('--accent').trim()     || '#58a6ff',
    border: s.getPropertyValue('--border').trim()     || '#30363d',
    bg2:    s.getPropertyValue('--bg-2').trim()       || '#161b22',
  };
}

function fmtCompact(n) {
  if (n == null) return '';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '+';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${abs}`;
}

function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86_400_000);
}

// Given an array of {d, v, r}, return the delta in `v` between the oldest
// and newest observation, plus the span in days. Returns null if <2 obs.
function computeDelta(history) {
  if (!history || history.length < 2) return null;
  const first = history[0];
  const last  = history[history.length - 1];
  return {
    delta: last.v - first.v,
    spanDays: daysBetween(first.d, last.d),
    firstDay: first.d,
    lastDay:  last.d,
    newest:   last.v,
  };
}

// Render the "what's accelerating" bar chart at the top of a tab.
// items: array of {id, label} for currently-trending items
// historyMap: object keyed by id → array of observations
function renderVelocityChart(items, historyMap, container, opts = {}) {
  const metricLabel = opts.metricLabel || 'change';

  const movers = items
    .map(item => {
      const delta = computeDelta(historyMap[item.id]);
      return delta ? { ...item, ...delta } : null;
    })
    .filter(Boolean)
    .filter(m => m.delta > 0) // accelerating only — declines aren't what pulse is for
    .sort((a, b) => b.delta - a.delta)
    .slice(0, VELOCITY_TOP_N);

  if (movers.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Determine the actual span we're claiming
  const spans = movers.map(m => m.spanDays);
  const maxSpan = Math.max(...spans);
  const allSame = spans.every(s => s === maxSpan);
  const spanLabel = allSame ? `${maxSpan}d` : `up to ${maxSpan}d`;

  container.innerHTML = `
    <div class="velocity-header">
      <span class="velocity-title">Accelerating</span>
      <span class="velocity-window">${metricLabel} · ${spanLabel}</span>
    </div>
    <div class="velocity-chart" aria-label="Bar chart of items by ${metricLabel} growth"></div>
  `;

  const chartEl = container.querySelector('.velocity-chart');
  const colors  = themeColors();

  // Render-once: dispose any existing instance attached to this DOM node
  const existing = echarts.getInstanceByDom(chartEl);
  if (existing) existing.dispose();

  const chart = echarts.init(chartEl, null, { renderer: 'svg' });

  // Reversed so highest mover is at the top
  const reversed = [...movers].reverse();

  chart.setOption({
    animation: false,
    grid: { left: 0, right: 60, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: colors.bg2,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      formatter: (params) => {
        const p = params[0];
        const m = reversed[p.dataIndex];
        return `<div style="font-weight:500">${m.label}</div>
                <div style="color:${colors.muted}">${fmtCompact(m.delta)} ${metricLabel} over ${m.spanDays}d</div>
                <div style="color:${colors.muted}">now: ${m.newest.toLocaleString()}</div>`;
      },
    },
    xAxis: {
      type: 'value',
      show: false,
      max: 'dataMax',
    },
    yAxis: {
      type: 'category',
      data: reversed.map(m => m.label),
      axisLine:  { show: false },
      axisTick:  { show: false },
      axisLabel: {
        color: colors.text,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        formatter: v => v.length > 32 ? v.slice(0, 30) + '…' : v,
      },
    },
    series: [{
      type: 'bar',
      data: reversed.map(m => m.delta),
      itemStyle: { color: colors.accent, borderRadius: [0, 3, 3, 0] },
      cursor: 'pointer',
      barWidth: 14,
      emphasis: {
        focus: 'self',
        itemStyle: { color: colors.accent, shadowBlur: 6, shadowColor: colors.accent },
      },
      label: {
        show: true,
        position: 'right',
        color: colors.muted,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        formatter: (p) => fmtCompact(p.value),
      },
    }],
  });

  // Click bar → caller's handler (typically: scroll to and highlight the matching card)
  if (typeof opts.onItemClick === 'function') {
    chart.on('click', { seriesType: 'bar' }, params => {
      const mover = reversed[params.dataIndex];
      if (mover) opts.onItemClick(mover.id, mover);
    });
  }

  // Resize handling
  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(chartEl);
}

// Tiny SVG sparkline. Returns an SVGElement.
// observations: array of {d, v, r} sorted oldest→newest
function buildSparkline(observations, opts = {}) {
  if (!observations || observations.length < 2) return null;

  const width  = opts.width  || 120;
  const height = opts.height || 22;
  const pad    = 1;

  const values = observations.map(o => o.v);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  const n = observations.length;
  const xStep = (width - pad * 2) / Math.max(1, n - 1);
  const points = observations.map((o, i) => {
    const x = pad + i * xStep;
    const y = pad + (height - pad * 2) * (1 - (o.v - min) / range);
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[n-1][0].toFixed(1)},${height - pad} L${pad},${height - pad} Z`;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'sparkline-area');
  svg.appendChild(area);

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', linePath);
  line.setAttribute('class', 'sparkline-line');
  line.setAttribute('fill', 'none');
  svg.appendChild(line);

  // Trailing dot
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', points[n-1][0].toFixed(1));
  dot.setAttribute('cy', points[n-1][1].toFixed(1));
  dot.setAttribute('r',  '1.6');
  dot.setAttribute('class', 'sparkline-dot');
  svg.appendChild(dot);

  // Accessibility: title with span
  const title = document.createElementNS(ns, 'title');
  const span = daysBetween(observations[0].d, observations[n-1].d);
  const delta = values[n-1] - values[0];
  title.textContent = `${fmtCompact(delta)} over ${span}d`;
  svg.appendChild(title);

  return svg;
}
