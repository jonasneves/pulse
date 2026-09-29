#!/usr/bin/env node
// Prints the weekly digest as GitHub-flavored markdown: per source, the items that gained the most
// over the last 7 days, including items that have left the trending lists but are still followed.

const fs   = require('fs');
const path = require('path');
const { hiddenKind, growth, fmtSigned, fmtCount, daysBetween } = require('../rules.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const read = name => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
const TOP_N = 10;
const PACE_NOTE_MIN = 2;

const history   = read('history.json');
const catalog   = read('catalog.json');
const judgments = read('judgments.json');
const today     = history.updated.slice(0, 10);

const SECTIONS = [
  { source: 'github', title: 'GitHub', metric: 'stars' },
  { source: 'models', title: 'Hugging Face models', metric: 'likes' },
  { source: 'spaces', title: 'Hugging Face Spaces', metric: 'likes' },
];

// Descriptions are third-party text: keep them from breaking the table, opening HTML or @-mentioning anyone.
const cell = s => String(s ?? '').replace(/[|<>@]/g, c => `\\${c}`).replace(/\s+/g, ' ').trim();
const shortDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function note(g) {
  const notes = [];
  if (daysBetween(g.firstSeen, today) <= 7) notes.push('new this week');
  else if (g.pace && g.pace >= PACE_NOTE_MIN) notes.push(`${g.pace.toFixed(1)}× its earlier pace`);
  if (g.lastRanked && g.lastRanked < today) notes.push(`off the list since ${shortDate(g.lastRanked)}`);
  return notes.join('; ');
}

function row(i, id, g, entry) {
  const name = entry?.url ? `[${cell(id)}](${entry.url})` : cell(id);
  const desc = entry?.description ? ` — ${cell(entry.description.length > 110 ? entry.description.slice(0, 107) + '…' : entry.description)}` : '';
  const span = g.span === 7 ? '' : ` in ${g.span}d`;
  return `| ${i} | ${name}${desc} | ${fmtSigned(g.delta)}${span} | ${fmtCount(g.now)} | ${note(g)} |`;
}

const out = [`Week ending ${shortDate(today)}. Gains are over the last 7 days, or since first seen when newer.`];

for (const { source, title, metric } of SECTIONS) {
  const bucket = history[source] || {};
  const ranked = Object.entries(bucket)
    .filter(([, obs]) => obs.at(-1).d === today)
    .map(([id, obs]) => ({ id, g: growth(obs) }))
    .filter(x => x.g && x.g.delta > 0)
    // by daily rate: a gap in observations stretches `span`, and raw deltas would favor it
    .sort((a, b) => b.g.delta / b.g.span - a.g.delta / a.g.span);

  const kind = id => source === 'github' ? hiddenKind(judgments.github?.[id]) : null;
  const shown  = ranked.filter(x => !kind(x.id)).slice(0, TOP_N);
  const hidden = ranked.filter(x => kind(x.id)).slice(0, TOP_N);

  out.push('', `### ${title}`);
  if (!shown.length) { out.push('', `No ${metric} gains recorded yet.`); continue; }
  out.push('', `| | | ${metric} | total | |`, '|--:|---|--:|--:|---|');
  shown.forEach((x, i) => out.push(row(i + 1, x.id, x.g, catalog[source]?.[x.id])));

  if (hidden.length) {
    out.push('', `<details><summary>${hidden.length} lists and courses hidden (Jev ${judgments.model})</summary>`, '');
    for (const x of hidden) out.push(`- ${kind(x.id)}: [${x.id}](${catalog[source]?.[x.id]?.url || `https://github.com/${x.id}`}) ${fmtSigned(x.g.delta)}`);
    out.push('', '</details>');
  }
}

console.log(out.join('\n'));
