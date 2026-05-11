/* ── HuggingFace card renderer ────────────────────────────────────────────
   Defines renderHFCards(data, container, onSelect).
   ──────────────────────────────────────────────────────────────────────── */

const PIPELINE_LABELS = {
  'text-generation':         'Text Generation',
  'text2text-generation':    'Text2Text',
  'question-answering':      'Q&A',
  'summarization':           'Summarization',
  'translation':             'Translation',
  'fill-mask':               'Fill Mask',
  'feature-extraction':      'Embeddings',
  'image-classification':    'Image Classification',
  'image-segmentation':      'Segmentation',
  'object-detection':        'Object Detection',
  'image-to-text':           'Image→Text',
  'text-to-image':           'Text→Image',
  'text-to-speech':          'Text→Speech',
  'automatic-speech-recognition': 'Speech Recognition',
  'audio-classification':    'Audio Classification',
  'token-classification':    'NER / Token',
  'zero-shot-classification':'Zero-Shot',
  'sentence-similarity':     'Similarity',
  'reinforcement-learning':  'RL',
  'robotics':                'Robotics',
  'video-classification':    'Video',
  'depth-estimation':        'Depth Estimation',
};

function hfFmtNum(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function buildModelCard(model, onSelect, history) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.dataset.rank = model.rank;
  card.dataset.itemId = model.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${model.id} — ${hfFmtNum(model.downloads)} downloads`);

  const pipelineLabel = model.pipelineTag
    ? (PIPELINE_LABELS[model.pipelineTag] || model.pipelineTag)
    : null;

  const tagsHtml = (model.tags || [])
    .filter(t => t !== model.pipelineTag && t.length < 30)
    .slice(0, 5)
    .map(t => `<span class="card-tag">${escapeHtmlHF(t)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="card-header">
      <span class="card-rank">#${model.rank}</span>
      <span class="card-name">
        <a href="${model.url}" target="_blank" rel="noopener noreferrer" tabindex="-1">${escapeHtmlHF(model.id)}</a>
      </span>
    </div>
    ${model.description ? `<p class="card-desc">${escapeHtmlHF(model.description)}</p>` : ''}
    ${pipelineLabel ? `<div class="card-pipeline">${escapeHtmlHF(pipelineLabel)}</div>` : ''}
    ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
    <div class="card-meta">
      <span class="card-meta-item">↓ ${hfFmtNum(model.downloads)}</span>
      <span class="card-meta-item">♥ ${hfFmtNum(model.likes)}</span>
      <span class="card-spark"></span>
    </div>
  `;

  const sparkSlot = card.querySelector('.card-spark');
  const spark = history && typeof buildSparkline === 'function' ? buildSparkline(history[model.id]) : null;
  if (spark) sparkSlot.appendChild(spark);
  else sparkSlot.remove();

  card.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    onSelect(card, model);
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(card, model);
    }
  });

  return card;
}

function renderHFSection(title, models, onSelect, history) {
  const section = document.createElement('div');
  section.className = 'spaces-section';

  const heading = document.createElement('h2');
  heading.className = 'spaces-section-heading';
  heading.textContent = title;
  section.appendChild(heading);

  const frag = document.createDocumentFragment();
  models.forEach(m => frag.appendChild(buildModelCard(m, onSelect, history)));
  section.appendChild(frag);

  return section;
}

function renderHFCards(data, container, onSelect, history) {
  container.innerHTML = '';

  if (!data?.models?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No HuggingFace data yet.</p>
        <p>Trigger the GitHub Action to fetch trending models:<br>
        <code>Actions → Fetch Trending Data → Run workflow</code></p>
        <p>Or run locally: <code>node scripts/fetch.js</code></p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  if (data.smallModels?.length) {
    frag.appendChild(renderHFSection('Small & Distilled', data.smallModels, onSelect, history));
  }
  frag.appendChild(renderHFSection('Top by Downloads', data.models, onSelect, history));
  container.appendChild(frag);
}

function escapeHtmlHF(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
