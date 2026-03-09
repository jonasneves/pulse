/* ── Tool surface (WebMCP) ────────────────────────────────────────────────
   Declarative manifest of tools this page exposes to AI agents.
   Each entry declares trust annotations and a JSON schema.
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
  },
];
