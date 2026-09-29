#!/usr/bin/env node
// Snapshots GitHub trending repos and Hugging Face trending models and Spaces, appends one
// observation per item per day to data/history.json, keeps observing items for FOLLOW_DAYS after
// they leave the lists, and has Jev judge what kind of thing each new GitHub repo is.
// No npm dependencies — Node 20+ built-ins only.

const fs   = require('fs');
const path = require('path');

const DATA_DIR         = path.join(__dirname, '..', 'data');
const HISTORY_MAX_DAYS = 90;
const FOLLOW_DAYS      = 30;
const JEV_MODEL        = 'jev-1.13.0';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getText(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  return { status: res.status, body: await res.text() };
}

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// Runs fn over items with at most `limit` in flight.
async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const day = offsetDays => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
}

function writeJSON(name, value, pretty = true) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, pretty ? 2 : 0));
}

// ── GitHub trending ───────────────────────────────────────────────────────

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseNumber(str) {
  return parseInt((str || '').replace(/,/g, ''), 10) || 0;
}

function parseGitHubTrending(html) {
  const repos = [];
  const articleRe = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let article;

  while ((article = articleRe.exec(html)) !== null) {
    const block = article[1];

    const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const hrefM = h2 && h2[1].match(/href="\/([\w.-]+\/[\w.-]+)"/);
    if (!hrefM) continue;
    const fullName = hrefM[1];

    const descM   = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const langM   = block.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/);
    const starsM  = block.match(/href="\/[\w.-]+\/[\w.-]+\/stargazers"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/);
    const forksM  = block.match(/href="\/[\w.-]+\/[\w.-]+\/(?:forks|network\/members)"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/);
    const todayM  = block.match(/([\d,]+)\s+stars?\s+today/i);

    repos.push({
      rank: repos.length + 1,
      fullName,
      url: `https://github.com/${fullName}`,
      description: descM ? stripTags(descM[1]) : '',
      language: langM ? stripTags(langM[1]) : null,
      stars: starsM ? parseNumber(starsM[1]) : 0,
      forks: forksM ? parseNumber(forksM[1]) : 0,
      starsToday: todayM ? parseNumber(todayM[1]) : 0,
    });
  }
  return repos;
}

async function fetchGitHub() {
  const { status, body } = await getText('https://github.com/trending', { Accept: 'text/html' });
  if (status !== 200) throw new Error(`GitHub trending returned HTTP ${status}`);
  const repos = parseGitHubTrending(body);
  if (repos.length === 0) throw new Error('Parsed 0 repos — GitHub HTML may have changed');
  console.log(`GitHub: ${repos.length} trending repos`);
  return { updated: new Date().toISOString(), repos };
}

// ── Hugging Face models ───────────────────────────────────────────────────

// Small model size markers in a model ID: 0.5B 1B 1.5B 2B 3B 3.8B 4B … 8B
const SMALL_SIZE_RE = /\b(0\.5|1\.5|3\.8|[1-8])b\b/i;
// Distillation or reasoning fine-tune markers
const DISTILL_RE = /distill|reason|\br1[-_]|[-_]r1\b/i;

const isSmallDistilled = id => SMALL_SIZE_RE.test(id) || DISTILL_RE.test(id);

const hfTags = tags => (tags || []).filter(t => !/^(arxiv|base_model|license|region|endpoints_compatible|dataset):?/.test(t)).slice(0, 6);

function parseModel(m, i) {
  return {
    rank: i + 1,
    id: m.id,
    url: `https://huggingface.co/${m.id}`,
    pipelineTag: m.pipeline_tag || null,
    likes: m.likes || 0,
    downloads: m.downloads || 0,
    trendingScore: m.trendingScore || 0,
    tags: hfTags(m.tags),
    lastModified: m.lastModified || null,
  };
}

// First substantive prose paragraph of a model README. Walks line by line so a heading directly
// followed by prose still surfaces the prose, and tracks code fences so imports never pass as prose.
function parseReadmeIntro(md) {
  if (!md) return null;
  let text = md;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) text = text.slice(end + 4);
  }

  let inCodeBlock = false;
  let buffer = [];

  const flush = () => {
    if (buffer.length === 0) return null;
    const joined = buffer.join(' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    buffer = [];
    if (joined.length < 60) return null;
    if ((joined.match(/ \| /g) || []).length >= 2) return null; // a row of links, not prose
    if ((joined.match(/[a-zA-Z]/g) || []).length < 40) return null;
    return joined.length > 240 ? joined.slice(0, 237) + '…' : joined;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      const out = flush();
      if (out) return out;
      continue;
    }
    if (inCodeBlock) continue;
    if (!line) {
      const out = flush();
      if (out) return out;
      continue;
    }
    // headings, HTML/badges, blockquotes, tables, lists, images, rules
    if (/^(#|<|>|\||[-*]\s|\d+\.\s|!\[|\[!\[)/.test(line) || /^(---|\*\*\*|___)$/.test(line)) continue;
    buffer.push(line);
  }
  return flush();
}

async function attachDescriptions(models) {
  await pool(models, 8, async m => {
    try {
      const { status, body } = await getText(`https://huggingface.co/${m.id}/raw/main/README.md`);
      if (status === 200) m.description = parseReadmeIntro(body) || undefined;
    } catch {}
  });
}

const MODEL_EXPAND = ['downloads', 'likes', 'pipeline_tag', 'tags', 'lastModified', 'trendingScore'].map(f => `&expand[]=${f}`).join('');

async function fetchModels() {
  const [all, textGen] = await Promise.all([
    getJSON(`https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=30${MODEL_EXPAND}`),
    getJSON(`https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=60${MODEL_EXPAND}`),
  ]);
  const trending = all.map(parseModel);
  const small = textGen.filter(m => isSmallDistilled(m.id)).map(parseModel);
  await attachDescriptions([...trending, ...small]);
  console.log(`Models: ${trending.length} trending, ${small.length} small/distilled (of ${textGen.length} trending text-generation)`);
  return { updated: new Date().toISOString(), trending, small };
}

// ── Hugging Face Spaces ───────────────────────────────────────────────────

const SPACE_EXPAND = ['cardData', 'tags', 'sdk', 'likes', 'lastModified', 'trendingScore'].map(f => `&expand[]=${f}`).join('');

function parseSpace(s, i) {
  const card = s.cardData || {};
  return {
    rank: i + 1,
    id: s.id,
    url: `https://huggingface.co/spaces/${s.id}`,
    title: card.title || null,
    description: card.short_description || null,
    sdk: s.sdk || null,
    likes: s.likes || 0,
    trendingScore: s.trendingScore || 0,
    tags: hfTags(s.tags).filter(t => t !== s.sdk),
    lastModified: s.lastModified || null,
  };
}

async function fetchSpaces() {
  const [trending, webml] = await Promise.all([
    getJSON(`https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=30${SPACE_EXPAND}`),
    getJSON(`https://huggingface.co/api/spaces?author=webml-community&sort=trendingScore&direction=-1&limit=30${SPACE_EXPAND}`),
  ]);
  console.log(`Spaces: ${trending.length} trending, ${webml.length} webml-community`);
  return { updated: new Date().toISOString(), trending: trending.map(parseSpace), webml: webml.map(parseSpace) };
}

// ── Sources ───────────────────────────────────────────────────────────────
// `metric` is the cumulative count history tracks; `follow` reads it, plus catalog fields where the
// API has them, for one item that is no longer listed.

const githubAuth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

const SOURCES = {
  github: {
    fetch: fetchGitHub,
    items: s => s.repos,
    id: r => r.fullName,
    metric: r => r.stars,
    catalog: r => ({ url: r.url, description: r.description, language: r.language }),
    follow: async id => {
      const r = await getJSON(`https://api.github.com/repos/${id}`, githubAuth);
      return { v: r.stargazers_count, catalog: { url: r.html_url, description: r.description || '', language: r.language } };
    },
  },
  models: {
    fetch: fetchModels,
    items: s => [...s.trending, ...s.small],
    id: m => m.id,
    metric: m => m.likes,
    catalog: m => ({ url: m.url, description: m.description || null, pipelineTag: m.pipelineTag }),
    follow: async id => ({ v: (await getJSON(`https://huggingface.co/api/models/${id}`)).likes }),
  },
  spaces: {
    fetch: fetchSpaces,
    items: s => [...s.trending, ...s.webml],
    id: s => s.id,
    metric: s => s.likes,
    catalog: s => ({ url: s.url, title: s.title, description: s.description, sdk: s.sdk }),
    follow: async id => ({ v: (await getJSON(`https://huggingface.co/api/spaces/${id}`)).likes }),
  },
};

// ── History ───────────────────────────────────────────────────────────────
// history[source][id] = [{d, v, r}], one per day, latest of each day wins. `r` is the item's rank
// on its list that day, or null when it was observed only because it listed within FOLLOW_DAYS.
// The committed file is the only record: a lost history.json starts every series over.

function record(bucket, id, v, r) {
  const today = day(0);
  const arr = (bucket[id] || []).filter(o => o.d !== today);
  arr.push({ d: today, v, r });
  bucket[id] = arr;
}

async function followUp(name, bucket, cat, listedToday) {
  const since = day(FOLLOW_DAYS);
  const ids = Object.keys(bucket).filter(id => !listedToday.has(id) && bucket[id].some(o => o.r != null && o.d >= since));
  let failed = 0;
  await pool(ids, 8, async id => {
    try {
      const { v, catalog } = await SOURCES[name].follow(id);
      if (Number.isFinite(v)) record(bucket, id, v, null);
      if (catalog && !cat[id]) cat[id] = catalog;
    } catch { failed++; }
  });
  console.log(`${name}: followed ${ids.length - failed} of ${ids.length} unlisted items`);
}

function prune(history) {
  const cutoff = day(HISTORY_MAX_DAYS);
  for (const bucket of Object.values(history)) {
    if (typeof bucket !== 'object') continue;
    for (const [id, arr] of Object.entries(bucket)) {
      const kept = arr.filter(o => o.d >= cutoff);
      if (kept.length) bucket[id] = kept; else delete bucket[id];
    }
  }
}

// ── Jev: what kind of repo is this ────────────────────────────────────────
// GitHub trending mixes software with reading lists and courses. Each catalogued repo is judged once,
// on its name, description and language; the answer is model output and lives apart from observations.

const KIND_QUESTION = 'What kind of repository is `repo`, judging from its name, description and language?';
const KIND_CRITERIA = {
  project:    'Software someone runs or builds on: an application, library, framework, CLI, agent, service, model, or dataset.',
  collection: 'A curated collection rather than software: an awesome-list, link roundup, or a set of prompts, skills, templates or configs gathered from elsewhere.',
  learning:   'Material for learning: a course, tutorial, book, guide, lecture notes, interview preparation, or a roadmap.',
  unclear:    'The name and description are too thin to tell.',
};

async function judgeKind(id, entry, key) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: { repo: { name: id, description: entry.description || '(none)', language: entry.language || '(none)' } },
      questions: { kind: { type: 'choice', instructions: KIND_QUESTION, criteria: KIND_CRITERIA } },
    }),
  });
  if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { kind } = (await res.json()).answers;
  return { kind: kind.choice, p: Math.round(kind.probabilities[kind.choice] * 100) / 100 };
}

async function judgeNewRepos(entries, judgments) {
  const key = process.env.TYPESAFE_API_KEY;
  const todo = Object.keys(entries).filter(id => !judgments.github[id]);
  if (!todo.length) return;
  if (!key) { console.log(`Jev: TYPESAFE_API_KEY unset, ${todo.length} repos left unjudged`); return; }
  let failed = 0;
  await pool(todo, 4, async id => {
    try { judgments.github[id] = { ...(await judgeKind(id, entries[id], key)), d: day(0) }; }
    catch (e) { failed++; console.warn(`Jev: ${id}: ${e.message}`); }
  });
  console.log(`Jev: judged ${todo.length - failed} of ${todo.length} new repos`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const history   = readJSON('history.json', {});
  const catalog   = readJSON('catalog.json', {});
  const judgments = readJSON('judgments.json', {});
  judgments.model = JEV_MODEL;
  judgments.github ??= {};

  const names = Object.keys(SOURCES);
  const results = await Promise.allSettled(names.map(n => SOURCES[n].fetch()));

  for (const [i, name] of names.entries()) {
    const result = results[i];
    if (result.status !== 'fulfilled') { console.error(`${name} failed: ${result.reason.message}`); continue; }
    const src = SOURCES[name];
    const snapshot = result.value;
    writeJSON(`${name}.json`, snapshot);

    const bucket = history[name] ??= {};
    const cat = catalog[name] ??= {};
    const listed = new Set();
    for (const item of src.items(snapshot)) {
      const id = src.id(item);
      if (listed.has(id)) continue; // an item on two lists records its first-list rank
      listed.add(id);
      record(bucket, id, src.metric(item), item.rank);
      cat[id] = src.catalog(item);
    }
    // Only follow when today's list is known, or listed items would be recorded as unlisted.
    await followUp(name, bucket, cat, listed);
  }

  await judgeNewRepos(catalog.github || {}, judgments);

  prune(history);
  for (const name of names) {
    const ids = history[name] || {};
    for (const id of Object.keys(catalog[name] || {})) if (!ids[id]) delete catalog[name][id];
  }
  for (const id of Object.keys(judgments.github)) if (!history.github?.[id]) delete judgments.github[id];

  history.updated = new Date().toISOString();
  writeJSON('history.json', history, false);
  writeJSON('catalog.json', catalog);
  writeJSON('judgments.json', judgments);

  if (results.every(r => r.status !== 'fulfilled')) process.exitCode = 1;
}

main();
