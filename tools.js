/* ── Tool definitions (WebMCP pattern) ────────────────────────────────────
   Each entry has trust annotations, a JSON schema, and an exec handler.
   getClaudeTools() converts to Anthropic API format for callAPI().
   ──────────────────────────────────────────────────────────────────────── */

const TOOL_DEFS = [
  {
    name: 'set_suggestions',
    description: 'Replace the suggestion chips with contextually relevant follow-up questions. Call after every response.',
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    schema: {
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
    exec(input) {
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
        const wasHidden = wrap.hidden;
        wrap.hidden = false;
        if (wasHidden) {
          wrap.dataset.open = '';
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        }
      } else {
        wrap.hidden = true;
        delete wrap.dataset.open;
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      }
      return 'Suggestions updated.';
    },
  },
  {
    name: 'set_focus',
    description: 'Highlight a specific card in the content pane to draw the user\'s attention to it.',
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    schema: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: '1-based rank of the item to highlight (matches the #N shown on the card)',
        },
      },
      required: ['index'],
    },
    exec(input) {
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
    },
  },
  {
    name: 'open_url',
    description: 'Open a GitHub repo or HuggingFace model page in a new browser tab.',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to open' },
      },
      required: ['url'],
    },
    exec(input) {
      const url = input.url;
      // Only allow github.com and huggingface.co
      if (/^https:\/\/(github\.com|huggingface\.co)\//.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return `Opened ${url}.`;
      }
      return 'URL not allowed (only github.com and huggingface.co).';
    },
  },
  {
    name: 'set_chat_position',
    description: "Move the floating chat panel to avoid blocking content the user is reading. Use proactively when focusing a card. Positions: 'bottom-right' (default), 'bottom-left', 'top-right', 'top-left', 'center-right', 'center-left'.",
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false,
    schema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center-right', 'center-left'],
          description: 'Named position for the chat panel',
        },
      },
      required: ['position'],
    },
    exec(input) {
      if (typeof window.setChatPosition === 'function') {
        window.setChatPosition(input.position);
        return `Moved chat to ${input.position}.`;
      }
      return 'Position function not available.';
    },
  },
];

// Convert to Anthropic API format for callAPI()
function getClaudeTools() {
  return TOOL_DEFS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema,
  }));
}

// Execute a tool by name; called by index.js after receiving a tool_use block
function executeTool(name, input) {
  const def = TOOL_DEFS.find(t => t.name === name);
  if (!def) return `Unknown tool: ${name}`;
  return def.exec(input);
}
