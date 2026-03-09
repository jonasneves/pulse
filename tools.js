/* ── Tool surface (WebMCP) ────────────────────────────────────────────────
   Declarative manifest of tools this page exposes to AI agents.
   Each entry declares trust annotations, a JSON schema, and an execute
   handler used when registering with navigator.modelContext.
   ──────────────────────────────────────────────────────────────────────── */

const TOOL_DEFS = [
  {
    name: 'set_focus',
    description: 'Highlight a specific card in the content pane to draw attention to it.',
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    schema: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: '1-based rank of the item to highlight',
        },
      },
      required: ['index'],
    },
    execute(input) {
      const cards = document.querySelectorAll('#card-list [data-rank]');
      cards.forEach(c => c.classList.remove('active'));
      const target = document.querySelector(`#card-list [data-rank="${input.index}"]`);
      if (target) {
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return { ok: true, focused: input.index };
      }
      return { ok: false, error: `Item #${input.index} not found` };
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
    execute(input) {
      if (/^https:\/\/(github\.com|huggingface\.co)\//.test(input.url)) {
        window.open(input.url, '_blank', 'noopener,noreferrer');
        return { ok: true, opened: input.url };
      }
      return { ok: false, error: 'URL not allowed (only github.com and huggingface.co)' };
    },
  },
  {
    name: 'filter_tab',
    description: 'Switch the active tab to show GitHub trending repos or HuggingFace models.',
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false,
    schema: {
      type: 'object',
      properties: {
        tab: {
          type: 'string',
          enum: ['github', 'huggingface'],
          description: 'Tab to activate',
        },
      },
      required: ['tab'],
    },
    execute(input) {
      const btn = document.querySelector(`.tab-btn[data-tab="${input.tab}"]`);
      if (btn) { btn.click(); return { ok: true, tab: input.tab }; }
      return { ok: false, error: `Unknown tab: ${input.tab}` };
    },
  },
];
