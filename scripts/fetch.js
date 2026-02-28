#!/usr/bin/env node
// Scrapes GitHub trending and fetches HuggingFace trending models.
// Writes results to data/github.json and data/huggingface.json.
// No npm dependencies — uses only Node.js built-ins.

const https = require('https');
const fs    = require('fs');
const path  = require('path');

function get(url, extraHeaders = {}) {
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
        return get(res.headers.location, extraHeaders).then(resolve).catch(reject);
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

async function fetchHuggingFace() {
  console.log('Fetching HuggingFace trending…');
  const { status, body } = await get(
    'https://huggingface.co/api/models?sort=downloads&direction=-1&limit=30',
    { Accept: 'application/json' }
  );
  if (status !== 200) throw new Error(`HuggingFace API returned HTTP ${status}`);
  const raw = JSON.parse(body);
  const models = raw.map((m, i) => ({
    rank: i + 1,
    id: m.id,
    url: `https://huggingface.co/${m.id}`,
    pipelineTag: m.pipeline_tag || null,
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    tags: (m.tags || []).filter(t => !t.startsWith('arxiv:') && !t.startsWith('base_model:')).slice(0, 6),
    lastModified: m.lastModified || null,
  }));
  console.log(`  Found ${models.length} models`);
  return { updated: new Date().toISOString(), models };
}

async function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const [ghResult, hfResult] = await Promise.allSettled([fetchGitHub(), fetchHuggingFace()]);

  let anyFailed = false;

  if (ghResult.status === 'fulfilled') {
    fs.writeFileSync(path.join(dataDir, 'github.json'), JSON.stringify(ghResult.value, null, 2));
    console.log('Wrote data/github.json');
  } else {
    console.error('GitHub fetch failed:', ghResult.reason.message);
    anyFailed = true;
  }

  if (hfResult.status === 'fulfilled') {
    fs.writeFileSync(path.join(dataDir, 'huggingface.json'), JSON.stringify(hfResult.value, null, 2));
    console.log('Wrote data/huggingface.json');
  } else {
    console.error('HuggingFace fetch failed:', hfResult.reason.message);
    anyFailed = true;
  }

  // Only fail hard if both sources failed — partial data is better than no commit
  if (anyFailed && ghResult.status !== 'fulfilled' && hfResult.status !== 'fulfilled') {
    process.exitCode = 1;
  }
}

main();
