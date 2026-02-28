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

function buildModelCard(model, onSelect) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.dataset.rank = model.rank;
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
    ${pipelineLabel ? `<div class="card-pipeline">${escapeHtmlHF(pipelineLabel)}</div>` : ''}
    ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
    <div class="card-meta">
      <span class="card-meta-item">↓ ${hfFmtNum(model.downloads)}</span>
      <span class="card-meta-item">♥ ${hfFmtNum(model.likes)}</span>
    </div>
  `;

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

function renderHFCards(data, container, onSelect) {
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
  data.models.forEach(model => frag.appendChild(buildModelCard(model, onSelect)));
  container.appendChild(frag);
}

function escapeHtmlHF(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
