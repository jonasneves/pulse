#!/usr/bin/env node
// Scrapes GitHub trending and fetches HuggingFace trending models.
// Writes results to data/github.json and data/huggingface.json.
// No npm dependencies — uses only Node.js built-ins.

const https = require('https');
const fs    = require('fs');
const path  = require('path');

function get(url, extraHeaders = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
    };
    https.request(options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error(`Too many redirects: ${url}`));
        return get(res.headers.location, extraHeaders, maxRedirects - 1).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject).end();
  });
}

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
  let rank = 0;

  while ((article = articleRe.exec(html)) !== null) {
    rank++;
    const block = article[1];

    // Repo path from h2 anchor
    const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!h2) continue;
    const hrefM = h2[1].match(/href="\/([\w.-]+\/[\w.-]+)"/);
    if (!hrefM) continue;
    const fullName = hrefM[1];
    const [owner, name] = fullName.split('/');

    // Description
    const descM = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descM ? stripTags(descM[1]) : '';

    // Language
    const langM = block.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/);
    const language = langM ? stripTags(langM[1]) : null;

    // Total stars (link to /stargazers)
    const starsM = block.match(/href="\/[\w.-]+\/[\w.-]+\/stargazers"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/);
    const stars = starsM ? parseNumber(starsM[1]) : 0;

    // Forks (link to /network/members)
    const forksM = block.match(/href="\/[\w.-]+\/[\w.-]+\/(?:forks|network\/members)"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/);
    const forks = forksM ? parseNumber(forksM[1]) : 0;

    // Stars today
    const todayM = block.match(/([\d,]+)\s+stars?\s+today/i);
    const starsToday = todayM ? parseNumber(todayM[1]) : 0;

    repos.push({ rank, owner, name, fullName, url: `https://github.com/${fullName}`, description, language, stars, forks, starsToday });
  }

  return repos;
}

async function fetchGitHub() {
  console.log('Fetching GitHub trending…');
  const { status, body } = await get('https://github.com/trending');
  if (status !== 200) throw new Error(`GitHub trending returned HTTP ${status}`);
  const repos = parseGitHubTrending(body);
  if (repos.length === 0) throw new Error('Parsed 0 repos — GitHub HTML may have changed');
  console.log(`  Found ${repos.length} repos`);
  return { updated: new Date().toISOString(), since: 'daily', repos };
}

// Matches small model size markers in a model ID (case-insensitive).
// Covers: 0.5B 1B 1.5B 2B 3B 3.8B 4B 6B 7B 8B
const SMALL_SIZE_RE = /\b(0\.5|1\.5|3\.8|[1-8])b\b/i;
// Matches distillation or reasoning fine-tune patterns
const DISTILL_RE = /distill|reason|\br1[-_]|[-_]r1\b/i;

function isSmallDistilled(id) {
  return SMALL_SIZE_RE.test(id) || DISTILL_RE.test(id);
}

function parseModel(m, rank) {
  return {
    rank,
    id: m.id,
    url: `https://huggingface.co/${m.id}`,
    pipelineTag: m.pipeline_tag || null,
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    tags: (m.tags || []).filter(t => !t.startsWith('arxiv:') && !t.startsWith('base_model:')).slice(0, 6),
    lastModified: m.lastModified || null,
  };
}

// Pull the first substantive prose paragraph out of a model README.
// Walks line-by-line so a heading immediately followed by prose (no blank
// line) still surfaces the prose. Tracks code fences to avoid returning
// import statements as "description."
function parseReadmeIntro(md) {
  if (!md) return null;
  let text = md;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) text = text.slice(end + 4);
  }

  const lines = text.split('\n');
  let inCodeBlock = false;
  let buffer = [];

  const flush = () => {
    if (buffer.length === 0) return null;
    const joined = buffer.join(' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    buffer = [];
    if (joined.length < 60) return null;
    const letters = (joined.match(/[a-zA-Z]/g) || []).length;
    if (letters < 40) return null; // skip strings that are mostly punctuation/code
    return joined.length > 240 ? joined.slice(0, 237) + '…' : joined;
  };

  for (const raw of lines) {
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

    if (line.startsWith('#'))      continue;          // headings — transparent
    if (line.startsWith('<'))      continue;          // raw HTML / badges
    if (line.startsWith('>'))      continue;          // blockquote / admonition
    if (line.startsWith('|'))      continue;          // table row
    if (/^[-*]\s/.test(line))      continue;          // list bullet
    if (/^\d+\.\s/.test(line))     continue;          // ordered list
    if (/^!\[.*\]\(/.test(line))   continue;          // image
    if (/^\[!\[/.test(line))       continue;          // shield/badge link
    if (line === '---' || line === '***' || line === '___') continue;

    buffer.push(line);
  }
  return flush();
}

async function fetchModelDescription(id) {
  try {
    const res = await get(`https://huggingface.co/${id}/raw/main/README.md`);
    if (res.status !== 200) return null;
    return parseReadmeIntro(res.body);
  } catch {
    return null;
  }
}

async function attachDescriptions(models) {
  const results = await Promise.allSettled(models.map(m => fetchModelDescription(m.id)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) models[i].description = r.value;
  });
}

async function fetchHuggingFace() {
  console.log('Fetching HuggingFace models…');
  const [topRes, trendingRes] = await Promise.allSettled([
    get('https://huggingface.co/api/models?sort=downloads&direction=-1&limit=30', { Accept: 'application/json' }),
    get('https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=60', { Accept: 'application/json' }),
  ]);

  if (topRes.status !== 'fulfilled' || topRes.value.status !== 200) {
    throw new Error(`HuggingFace top models API failed`);
  }
  const models = JSON.parse(topRes.value.body).map((m, i) => parseModel(m, i + 1));
  console.log(`  Found ${models.length} top models`);

  let smallModels = [];
  if (trendingRes.status === 'fulfilled' && trendingRes.value.status === 200) {
    const raw = JSON.parse(trendingRes.value.body);
    const filtered = raw.filter(m => isSmallDistilled(m.id));
    smallModels = filtered.map((m, i) => parseModel(m, i + 1));
    console.log(`  Found ${smallModels.length} small/distilled models (from ${raw.length} trending)`);
  } else {
    console.warn('  Trending models fetch failed — small models section will be empty');
  }

  // Fetch READMEs in parallel for one-liner descriptions
  console.log('  Fetching READMEs for descriptions…');
  await Promise.all([attachDescriptions(models), attachDescriptions(smallModels)]);
  const withDesc = models.filter(m => m.description).length + smallModels.filter(m => m.description).length;
  console.log(`  Attached descriptions to ${withDesc} / ${models.length + smallModels.length} models`);

  return { updated: new Date().toISOString(), models, smallModels };
}

function parseSpaces(raw) {
  return raw.map((s, i) => {
    const card = s.cardData || {};
    return {
      rank: i + 1,
      id: s.id,
      title: card.title || null,
      description: card.short_description || null,
      url: `https://huggingface.co/spaces/${s.id}`,
      sdk: s.sdk || null,
      likes: s.likes || 0,
      tags: (s.tags || []).filter(t => !t.startsWith('arxiv:') && !t.startsWith('base_model:')).slice(0, 6),
      lastModified: s.lastModified || null,
    };
  });
}

async function fetchHuggingFaceSpaces() {
  console.log('Fetching HuggingFace spaces…');
  const expand = '&expand[]=cardData&expand[]=tags&expand[]=sdk&expand[]=likes&expand[]=lastModified';
  const [trendingRes, webmlRes] = await Promise.allSettled([
    get(`https://huggingface.co/api/spaces?sort=likes&direction=-1&limit=30${expand}`, { Accept: 'application/json' }),
    get(`https://huggingface.co/api/spaces?author=webml-community&sort=likes&direction=-1&limit=30${expand}`, { Accept: 'application/json' }),
  ]);

  let trending = [];
  if (trendingRes.status === 'fulfilled' && trendingRes.value.status === 200) {
    trending = parseSpaces(JSON.parse(trendingRes.value.body));
    console.log(`  Found ${trending.length} trending spaces`);
  } else {
    console.warn('  Trending spaces fetch failed');
  }

  let webml = [];
  if (webmlRes.status === 'fulfilled' && webmlRes.value.status === 200) {
    webml = parseSpaces(JSON.parse(webmlRes.value.body));
    console.log(`  Found ${webml.length} webml-community spaces`);
  } else {
    console.warn('  WebML community spaces fetch failed');
  }

  if (trending.length === 0 && webml.length === 0) throw new Error('All spaces fetches returned empty');
  return { updated: new Date().toISOString(), trending, webml };
}

// ── History accumulation ──────────────────────────────────────────────────
// data/history.json tracks day-keyed observations per item for the last 30 days.
// scripts/build-history.js bootstraps this from git log; here we just append.

const HISTORY_MAX_DAYS = 90;

function extractObservations(sourceKey, snapshot) {
  if (sourceKey === 'github') {
    return (snapshot.repos || []).map(r => ({ id: r.fullName, v: r.stars, r: r.rank }));
  }
  if (sourceKey === 'huggingface') {
    const out = [];
    for (const m of (snapshot.models || []))      out.push({ id: m.id, v: m.downloads, r: m.rank });
    for (const m of (snapshot.smallModels || [])) out.push({ id: m.id, v: m.downloads, r: m.rank });
    return out;
  }
  if (sourceKey === 'spaces') {
    const out = [];
    for (const s of (snapshot.trending || [])) out.push({ id: s.id, v: s.likes, r: s.rank });
    for (const s of (snapshot.webml || []))    out.push({ id: s.id, v: s.likes, r: s.rank });
    return out;
  }
  return [];
}

function updateHistory(historyPath, updates) {
  let history = {};
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch {}

  const today    = new Date().toISOString().slice(0, 10);
  const cutoffMs = Date.now() - HISTORY_MAX_DAYS * 86_400_000;
  const cutoff   = new Date(cutoffMs).toISOString().slice(0, 10);

  for (const [sourceKey, observations] of Object.entries(updates)) {
    if (!history[sourceKey]) history[sourceKey] = {};
    const bucket = history[sourceKey];

    // Append/replace today's observation per item
    for (const { id, v, r } of observations) {
      const arr = bucket[id] || [];
      const filtered = arr.filter(o => o.d !== today && o.d >= cutoff);
      filtered.push({ d: today, v, r });
      filtered.sort((a, b) => a.d.localeCompare(b.d));
      bucket[id] = filtered;
    }

    // Drop items whose newest observation is older than cutoff
    for (const id of Object.keys(bucket)) {
      const arr = bucket[id];
      if (arr.length === 0 || arr[arr.length - 1].d < cutoff) delete bucket[id];
    }
  }

  history.updated = new Date().toISOString();
  fs.writeFileSync(historyPath, JSON.stringify(history));
}

async function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const [ghResult, hfResult, spacesResult] = await Promise.allSettled([
    fetchGitHub(), fetchHuggingFace(), fetchHuggingFaceSpaces(),
  ]);

  let anyFailed = false;
  const historyUpdates = {};

  if (ghResult.status === 'fulfilled') {
    fs.writeFileSync(path.join(dataDir, 'github.json'), JSON.stringify(ghResult.value, null, 2));
    historyUpdates.github = extractObservations('github', ghResult.value);
    console.log('Wrote data/github.json');
  } else {
    console.error('GitHub fetch failed:', ghResult.reason.message);
    anyFailed = true;
  }

  if (hfResult.status === 'fulfilled') {
    fs.writeFileSync(path.join(dataDir, 'huggingface.json'), JSON.stringify(hfResult.value, null, 2));
    historyUpdates.huggingface = extractObservations('huggingface', hfResult.value);
    console.log('Wrote data/huggingface.json');
  } else {
    console.error('HuggingFace fetch failed:', hfResult.reason.message);
    anyFailed = true;
  }

  if (spacesResult.status === 'fulfilled') {
    fs.writeFileSync(path.join(dataDir, 'spaces.json'), JSON.stringify(spacesResult.value, null, 2));
    historyUpdates.spaces = extractObservations('spaces', spacesResult.value);
    console.log('Wrote data/spaces.json');
  } else {
    console.error('HuggingFace Spaces fetch failed:', spacesResult.reason.message);
    anyFailed = true;
  }

  if (Object.keys(historyUpdates).length > 0) {
    updateHistory(path.join(dataDir, 'history.json'), historyUpdates);
    console.log('Updated data/history.json');
  }

  // Only fail hard if all sources failed — partial data is better than no commit
  if (anyFailed && ghResult.status !== 'fulfilled' && hfResult.status !== 'fulfilled' && spacesResult.status !== 'fulfilled') {
    process.exitCode = 1;
  }
}

main();
