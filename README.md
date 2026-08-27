# pulse

A zero-build GitHub Pages dashboard tracking velocity across GitHub trending repos, HuggingFace models, and HF Spaces — a scheduled Action scrapes every 3h, appends to a 90-day observation log, and the static page renders deltas as bar charts and per-card sparklines.

Tools (`set_focus`, `open_url`, `filter_tab`) register with the browser's AI context via [WebMCP](https://github.com/webmachinelearning/webmcp) (`navigator.modelContext`), so an external agent can drive the view instead of an embedded chat.

```
GitHub Action (cron 0 */3 * * *)
  └─ scripts/fetch.js ──► data/{github,huggingface,spaces}.json
                          data/history.json   (90-day log: source→id→[{d,v,r}])
                          commit [skip ci]
                                   │
static page (index.html) ◄─ fetch() data/*.json on load
  ├─ velocity bar chart  (ECharts, observed span)
  ├─ per-card sparklines (plain SVG)
  └─ tools.js ──► navigator.modelContext.registerTool(...)
```

## Run locally

```bash
node scripts/fetch.js          # populate data/ once (no npm deps, Node built-ins only)
python3 -m http.server 8080    # serve — fetch() won't work over file://
```

WebMCP tool registration requires Chrome 146+ Canary with `chrome://flags/#webmcp-for-testing`; the dashboard renders fine without it.

## Layout

Flat files, one concern each. `index.html` shell, `index.css` styles, `index.js` UI wiring; `{github,huggingface,spaces}.js` card renderers; `charts.js` velocity bar + sparklines; `tools.js` the WebMCP surface. See [CLAUDE.md](CLAUDE.md) for the per-file map, data-flow notes, and visualization guidance.
