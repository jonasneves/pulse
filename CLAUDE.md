# pulse

GitHub Pages dashboard for trending GitHub repos and HuggingFace models, with an AI chat sidebar.

## Architecture

Flat files, no build step. Keep concerns in separate files.

| File | Owns |
|------|------|
| `scripts/fetch.js` | Node.js scraper — GitHub HTML + HuggingFace API. No npm deps. |
| `.github/workflows/fetch-trending.yml` | Scheduled Action: runs scraper, commits data/*.json |
| `data/github.json` | Committed by Action. Never edit by hand. |
| `data/huggingface.json` | Committed by Action. Never edit by hand. |
| `index.html` | Shell + layout |
| `index.css` | All styles. CSS custom properties for theming. |
| `system-prompt.js` | `buildSystem(state)` — dynamic prompt aware of tab + focused item |
| `tools.js` | `TOOLS` array + `executeTool(name, input)` |
| `github.js` | `renderGitHubCards(data, container, onSelect)` + card builder |
| `huggingface.js` | `renderHFCards(data, container, onSelect)` + card builder |
| `index.js` | All UI wiring: tabs, card selection, chat loop, API key |

## Data flow

1. GitHub Action runs `scripts/fetch.js` every 3 hours
2. Script writes `data/github.json` and `data/huggingface.json`
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

1. Add schema to `TOOLS` array in `tools.js`
2. Add handler case in `executeTool` in `tools.js`
3. Document it in `system-prompt.js` under "Tools — use proactively"

## GitHub Action notes

- Workflow has `concurrency` set to prevent overlapping runs
- Commit skipped (via `git diff --staged --quiet`) if data hasn't changed
- `[skip ci]` in commit message prevents triggering another workflow run
- Manual trigger available via `workflow_dispatch` in GitHub UI
