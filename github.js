/* ── GitHub card renderer ─────────────────────────────────────────────────
   Defines renderGitHubCards(data, container, onSelect).
   ──────────────────────────────────────────────────────────────────────── */

// Top language colors (GitHub's palette)
const LANG_COLORS = {
  'Python':       '#3572A5',
  'JavaScript':   '#f1e05a',
  'TypeScript':   '#3178c6',
  'Rust':         '#dea584',
  'Go':           '#00ADD8',
  'C':            '#555555',
  'C++':          '#f34b7d',
  'C#':           '#178600',
  'Java':         '#b07219',
  'Ruby':         '#701516',
  'PHP':          '#4F5D95',
  'Swift':        '#F05138',
  'Kotlin':       '#A97BFF',
  'Shell':        '#89e051',
  'HTML':         '#e34c26',
  'CSS':          '#563d7c',
  'Jupyter Notebook': '#DA5B0B',
  'Dockerfile':   '#384d54',
  'Scala':        '#c22d40',
  'Haskell':      '#5e5086',
  'Lua':          '#000080',
  'Dart':         '#00B4AB',
  'R':            '#198CE7',
  'Zig':          '#ec915c',
  'Elixir':       '#6e4a7e',
  'Nix':          '#7e7eff',
};

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function buildRepoCard(repo, onSelect) {
  const card = document.createElement('div');
  card.className = 'repo-card';
  card.dataset.rank = repo.rank;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${repo.fullName} — ${repo.starsToday} stars today`);

  const langColor = repo.language ? (LANG_COLORS[repo.language] || '#8b949e') : null;

  card.innerHTML = `
    <div class="card-header">
      <span class="card-rank">#${repo.rank}</span>
      <span class="card-name">
        <a href="${repo.url}" target="_blank" rel="noopener noreferrer" tabindex="-1">${repo.fullName}</a>
      </span>
      ${repo.starsToday ? `<span class="card-today">▲ ${repo.starsToday} today</span>` : ''}
    </div>
    ${repo.description ? `<p class="card-desc">${escapeHtml(repo.description)}</p>` : ''}
    <div class="card-meta">
      ${langColor ? `
        <span class="card-meta-item">
          <span class="lang-dot" style="background:${langColor}"></span>
          ${escapeHtml(repo.language)}
        </span>` : ''}
      ${repo.stars ? `<span class="card-meta-item">★ ${fmtNum(repo.stars)}</span>` : ''}
      ${repo.forks ? `<span class="card-meta-item">⑂ ${fmtNum(repo.forks)}</span>` : ''}
    </div>
  `;

  // Click selects card (but not if clicking the link itself)
  card.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    onSelect(card, repo);
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(card, repo);
    }
  });

  return card;
}

function renderGitHubCards(data, container, onSelect) {
  container.innerHTML = '';

  if (!data?.repos?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No GitHub data yet.</p>
        <p>Trigger the GitHub Action to fetch trending repos:<br>
        <code>Actions → Fetch Trending Data → Run workflow</code></p>
        <p>Or run locally: <code>node scripts/fetch.js</code></p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  data.repos.forEach(repo => frag.appendChild(buildRepoCard(repo, onSelect)));
  container.appendChild(frag);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
