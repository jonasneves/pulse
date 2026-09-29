/* ── WebMCP tool surface ──────────────────────────────────────────────────
   Tools this page registers with document.modelContext so an agent in the
   browser can read the data and steer the view. `pulse` is the page state
   and actions index.js exposes.
   ──────────────────────────────────────────────────────────────────────── */

const SOURCE_ENUM = ['github', 'models', 'spaces'];
const TAB_ENUM = ['all', ...SOURCE_ENUM];

const TOOL_DEFS = [
  {
    name: 'list_items',
    description: 'List the items on a tab (GitHub trending repos, trending Hugging Face models, or trending Spaces) in list order, with each one\'s description, total, gain over the last 7 days (and the days it covers), and, for GitHub, Jev\'s judgment of whether it is a project, a curated list, or learning material. For the "all" tab: the fastest growers on each source, and groups of related items spanning several sources (a model, models built on it, Spaces using them, a repo with a matching name), with the evidence for each link.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { tab: { type: 'string', enum: TAB_ENUM, description: 'Defaults to the tab on screen' } },
    },
    execute: ({ tab } = {}) => pulse.listItems(tab || pulse.activeTab),
  },
  {
    name: 'get_history',
    description: 'Daily observations for one item over up to 90 days: date, total (stars or likes), and rank on its list that day (null on days it was followed after leaving the list).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        tab: { type: 'string', enum: SOURCE_ENUM },
        id:  { type: 'string', description: 'owner/name for a repo, model, or Space' },
      },
      required: ['tab', 'id'],
    },
    execute: ({ tab, id }) => pulse.history?.[tab]?.[id] ?? { error: `No history for ${id} on ${tab}` },
  },
  {
    name: 'show_tab',
    description: 'Switch the page to a tab.',
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: 'object',
      properties: { tab: { type: 'string', enum: TAB_ENUM } },
      required: ['tab'],
    },
    execute: async ({ tab }) => { await pulse.showTab(tab); return { tab }; },
  },
  {
    name: 'focus_item',
    description: 'Scroll to one item on the current tab and highlight it.',
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'owner/name as returned by list_items' },
        source: { type: 'string', enum: SOURCE_ENUM, description: 'On the "all" tab, which source\'s row to focus when an id is both a model and a Space' },
      },
      required: ['id'],
    },
    execute: ({ id, source }) => pulse.focusItem(id, source) ? { focused: id } : { error: `${id} is not on the current tab` },
  },
  {
    name: 'set_hide_judged',
    description: 'Hide or show GitHub repos Jev judged to be curated lists or learning material (p ≥ 0.7).',
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: 'object',
      properties: { hide: { type: 'boolean' } },
      required: ['hide'],
    },
    execute: ({ hide }) => { pulse.setHideJudged(hide); return { hide }; },
  },
];

async function registerWebMCPTools() {
  const mc = document.modelContext ?? navigator.modelContext;
  if (!mc?.registerTool) return 0;
  let count = 0;
  for (const t of TOOL_DEFS) {
    try {
      await mc.registerTool({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
        execute: async args => ({ content: [{ type: 'text', text: JSON.stringify(await t.execute(args ?? {})) }] }),
      });
      count++;
    } catch (e) {
      console.warn(`[WebMCP] ${t.name} not registered:`, e);
    }
  }
  return count;
}
