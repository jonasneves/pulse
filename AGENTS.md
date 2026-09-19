# pulse

GitHub Pages dashboard for trending GitHub repos, HuggingFace models, and HF Spaces. Tools register with the browser's AI context via WebMCP (`navigator.modelContext`) so an external agent can drive the view, instead of an embedded chat.

Open backlog and unshipped direction live in [issues](https://github.com/jonasneves/pulse/issues), not here.

## Architecture

Flat files, no build step. Keep concerns in separate files.

| File | Owns |
|------|------|
| `scripts/fetch.js` | Node.js scraper — GitHub HTML + HuggingFace API. Also appends to `data/history.json`. No npm deps. |
| `.github/workflows/fetch-trending.yml` | Scheduled Action: runs scraper, commits data/*.json |
| `data/github.json` | Committed by Action. Never edit by hand. |
| `data/huggingface.json` | Committed by Action. Never edit by hand. |
| `data/spaces.json` | Committed by Action. Never edit by hand. |
| `data/history.json` | 90-day per-item observation log keyed by source → id → `[{d,v,r}]`. Day-resolution; latest of each day wins. Appended by `fetch.js`; no rebuild path — the committed file is the record. |
| `index.html` | Shell + layout. ECharts loaded via jsDelivr CDN. |
| `index.css` | All styles. CSS custom properties for theming. |
| `tools.js` | `TOOL_DEFS` array — WebMCP tool surface (each entry: trust hints, JSON schema, `execute` handler) |
| `charts.js` | `renderVelocityChart()` (ECharts horizontal bar) + `buildSparkline()` (plain SVG, no ECharts per card) |
| `github.js` | `renderGitHubCards(data, container, onSelect, history)` + card builder |
| `huggingface.js` | `renderHFCards(data, container, onSelect, history)` + card builder |
| `spaces.js` | `renderSpacesCards(data, container, onSelect, history)` + card builder |
| `index.js` | All UI wiring: tabs, card selection, velocity chart per tab, WebMCP tool registration (`registerWebMCPTools`) |

## Data flow

1. GitHub Action runs `scripts/fetch.js` every 3 hours
2. Script writes `data/{github,huggingface,spaces}.json` and appends to `data/history.json`
3. Action commits and pushes with `[skip ci]`
4. Static page fetches `data/*.json` on load

## Local development

```bash
# Fetch data once
node scripts/fetch.js

# Serve (required — fetch() won't work over file://)
python3 -m http.server 8080
# or
npx serve .
```

## Adding a new tool

1. Add an entry to `TOOL_DEFS` in `tools.js` (name, description, trust hints, JSON schema, `execute` handler)
2. It registers automatically via `registerWebMCPTools()` in `index.js`

## GitHub Action notes

- `concurrency` uses `cancel-in-progress: true` — a new run cancels one still in flight rather than queueing behind it
- Commit skipped (via `git diff --staged --quiet`) if data hasn't changed
- `[skip ci]` in commit message prevents triggering another workflow run
- Manual trigger available via `workflow_dispatch` in GitHub UI

## Design rules

- **Filter before sources.** Adding a source without a stronger filter adds noise, not signal.

### Visualization

- Time windows must be labeled. The velocity chart shows the actual observed span ("57d"), never a presumed window.
- Sparklines omit axes by design — they encode *shape*, not values. Hover surfaces the delta and span in a `<title>`.
- Bars start at zero (delta encoding requires it). Lines do not.
- LLM-generated themes or clusters are model output: they must be visibly distinguishable from raw observations, and must keep the source items reachable.
