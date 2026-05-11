/* ── HuggingFace Spaces card renderer ─────────────────────────────────────
   Defines renderSpacesCards(data, container, onSelect).
   ──────────────────────────────────────────────────────────────────────── */

const SDK_LABELS = {
  gradio:    'Gradio',
  streamlit: 'Streamlit',
  docker:    'Docker',
  static:    'Static',
};

function spacesFmtNum(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function escapeHtmlSpaces(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSpaceCard(space, onSelect, history) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.dataset.rank = space.rank;
  card.dataset.itemId = space.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${space.id} — ${spacesFmtNum(space.likes)} likes`);

  const sdkLabel = space.sdk ? (SDK_LABELS[space.sdk] || space.sdk) : null;

  const tagsHtml = (space.tags || [])
    .filter(t => t !== space.sdk && t.length < 30)
    .slice(0, 5)
    .map(t => `<span class="card-tag">${escapeHtmlSpaces(t)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="card-header">
      <span class="card-rank">#${space.rank}</span>
      <span class="card-name">
        <a href="${space.url}" target="_blank" rel="noopener noreferrer" tabindex="-1">${escapeHtmlSpaces(space.id)}</a>
      </span>
    </div>
    ${sdkLabel ? `<div class="card-pipeline">${escapeHtmlSpaces(sdkLabel)}</div>` : ''}
    ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
    <div class="card-meta">
      <span class="card-meta-item">♥ ${spacesFmtNum(space.likes)}</span>
      <span class="card-spark"></span>
    </div>
  `;

  const sparkSlot = card.querySelector('.card-spark');
  const spark = history && typeof buildSparkline === 'function' ? buildSparkline(history[space.id]) : null;
  if (spark) sparkSlot.appendChild(spark);
  else sparkSlot.remove();

  card.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    onSelect(card, space);
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(card, space);
    }
  });

  return card;
}

function renderSection(title, spaces, onSelect, history) {
  const section = document.createElement('div');
  section.className = 'spaces-section';

  const heading = document.createElement('h2');
  heading.className = 'spaces-section-heading';
  heading.textContent = title;
  section.appendChild(heading);

  const frag = document.createDocumentFragment();
  spaces.forEach(s => frag.appendChild(buildSpaceCard(s, onSelect, history)));
  section.appendChild(frag);

  return section;
}

function renderSpacesCards(data, container, onSelect, history) {
  container.innerHTML = '';

  const hasTrending = data?.trending?.length > 0;
  const hasWebml    = data?.webml?.length > 0;

  if (!hasTrending && !hasWebml) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No Spaces data yet.</p>
        <p>Trigger the GitHub Action to fetch data:<br>
        <code>Actions → Fetch Trending Data → Run workflow</code></p>
        <p>Or run locally: <code>node scripts/fetch.js</code></p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  if (hasTrending) frag.appendChild(renderSection('Trending', data.trending, onSelect, history));
  if (hasWebml)    frag.appendChild(renderSection('WebML Community', data.webml, onSelect, history));
  container.appendChild(frag);
}
