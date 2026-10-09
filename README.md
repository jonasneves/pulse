# pulse

A zero-build GitHub Pages dashboard that tracks growth of GitHub trending repos (stars), trending Hugging Face models (likes), and trending Hugging Face Spaces (likes). A daily Action snapshots the lists, appends one observation per item per day to a 90-day log, and keeps observing items for 30 days after they leave a list. The page shows each item's gain per day over the last 7 days (or since first seen) and a 90-day trace. The All tab shows each source's fastest growers side by side, and groups related items across sources, such as a model, the models built on it, and the Spaces that use them. A weekly Action posts the largest gains as an issue comment.

GitHub trending mixes software with reading lists and courses. [Jev](https://docs.typesafe.ai) (TypeSafe's `jev-1.13.0`) judges each catalogued repo's kind once; repos judged a curated list or learning material with p ≥ 0.7 are hidden by default and stay reachable in a collapsed section.

Tools (`list_items`, `get_history`, `show_tab`, `focus_item`, `set_hide_judged`) register with the browser through [WebMCP](https://github.com/webmachinelearning/webmcp) (`document.modelContext`, falling back to `navigator.modelContext`), so an agent in the browser can read the data and drive the view.

```
GitHub Action, daily (cron 17 5 * * *)
  └─ scripts/fetch.js ──► data/{github,models,spaces}.json   today's lists
                          data/history.json    90-day log: source → id → [{d,v,r}]
                          data/catalog.json    url/description per tracked item
                          data/judgments.json  Jev kind per GitHub repo
                          commit [skip ci]
                                   │
static page (index.html) ◄─ fetch() data/*.json on load
  ├─ fastest-growing bars   (plain HTML, 7-day rate)
  ├─ per-row traces         (plain SVG, shared 90-day axis)
  └─ tools.js ──► document.modelContext.registerTool(...)

GitHub Action, Mondays (cron 0 8 * * 1)
  └─ scripts/digest.js ──► comment on the open issue labelled `digest`
```

## Run locally

```bash
node scripts/fetch.js          # populate data/ (no npm deps, Node 20+ built-ins only)
python3 -m http.server 8080    # serve; fetch() does not work over file://
node scripts/digest.js         # print the weekly digest as markdown
```

Set `TYPESAFE_API_KEY` to have `fetch.js` judge new repos with Jev; without it judging is skipped. In CI it comes from the repo secret of the same name.

In Chrome stable, ordinary visitors get `document.modelContext` only through the WebMCP origin trial (a token served in the page) or `chrome://flags/#enable-webmcp-testing`. The dashboard renders without it.

**From Claude, Cursor or VS Code.** The page loads `relay.kandue.app/webmcp.js`, from an MCP relay the author runs on Cloudflare. A visitor who presses **Use in Claude** gets one-click Add buttons with a private address for their tab; their AI app's tool calls then reach this page through the relay, and the results come back the same way. The relay passes them through and does not store them. Nothing connects until that button is pressed. In a browser without `document.modelContext`, the script provides one so the tools register anyway.

## Layout

Flat files, one concern each: `index.html` shell, `index.css` styles, `index.js` page state and rendering, `rows.js` per-source row config and renderer, `trace.js` traces and gain bars, `rules.js` derivations shared with the digest, `links.js` cross-source grouping, `overview.js` the All tab, `tools.js` the WebMCP surface. See [AGENTS.md](AGENTS.md) for the per-file map, data flow, and design rules.
