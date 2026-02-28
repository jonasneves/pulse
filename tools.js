/* ── Tool schemas + execution ─────────────────────────────────────────────
   Loaded before index.js. Defines TOOLS array and executeTool(name, input).
   ──────────────────────────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'set_suggestions',
    description: 'Replace the suggestion chips with contextually relevant follow-up questions. Call after every response.',
    input_schema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: '2–4 short follow-up questions',
        },
      },
      required: ['suggestions'],
    },
  },
  {
    name: 'set_focus',
    description: 'Highlight a specific card in the content pane to draw the user\'s attention to it.',
    input_schema: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: '1-based rank of the item to highlight (matches the #N shown on the card)',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'open_url',
    description: 'Open a GitHub repo or HuggingFace model page in a new browser tab.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to open' },
      },
      required: ['url'],
    },
  },
];

// executeTool is called by index.js after receiving a tool_use block.
// Returns a string result to send back as tool_result content.
function executeTool(name, input) {
  if (name === 'set_suggestions') {
    const chips     = input.suggestions || [];
    const wrap      = document.getElementById('suggestions-wrap');
    const container = document.getElementById('suggestions');
    const countEl   = document.getElementById('suggestions-count');
    const toggleBtn = document.getElementById('suggestions-toggle');

    container.innerHTML = '';
    chips.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-chip';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        const ta = document.getElementById('chat-input');
        ta.value = text;
        ta.focus();
        document.getElementById('chat-send').click();
      });
      container.appendChild(btn);
    });

    if (chips.length > 0) {
      if (countEl) countEl.textContent = `${chips.length} suggestion${chips.length > 1 ? 's' : ''}`;
      wrap.hidden = false;
      wrap.dataset.open = '';
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    } else {
      wrap.hidden = true;
      delete wrap.dataset.open;
    }
    return 'Suggestions updated.';
  }

  if (name === 'set_focus') {
    const idx = input.index;
    const cards = document.querySelectorAll('#card-list [data-rank]');
    cards.forEach(c => c.classList.remove('active'));
    const target = document.querySelector(`#card-list [data-rank="${idx}"]`);
    if (target) {
      target.classList.add('active');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return `Focused item #${idx}.`;
    }
    return `Item #${idx} not found in current view.`;
  }

  if (name === 'open_url') {
    const url = input.url;
    // Basic safety: only allow github.com and huggingface.co
    if (/^https:\/\/(github\.com|huggingface\.co)\//.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return `Opened ${url}.`;
    }
    return 'URL not allowed (only github.com and huggingface.co).';
  }

  return `Unknown tool: ${name}`;
}
