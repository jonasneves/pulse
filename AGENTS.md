# pulse

GitHub Pages dashboard tracking growth of GitHub trending repos (stars), Hugging Face trending models (likes), and Hugging Face trending Spaces (likes). Tools register with the browser through WebMCP (`document.modelContext`, falling back to `navigator.modelContext`) so an external agent can drive the view, instead of an embedded chat.

Open backlog and unshipped direction live in [issues](https://github.com/jonasneves/pulse/issues), not here.

## Architecture

Flat files, no build step. Keep concerns in separate files.

| File | Owns |
|------|------|
| `scripts/fetch.js` | Node scraper: GitHub trending HTML, Hugging Face models and Spaces APIs. Writes the snapshots, appends to history, follows unlisted items, calls Jev. No npm deps. |
| `scripts/digest.js` | Prints the weekly digest as GitHub markdown: per source, the top 10 by 7-day gain rate, with Jev-hidden repos in a `<details>`. |
| `.github/workflows/fetch-trending.yml` | Daily Action: runs `fetch.js`, commits `data/`. |
| `.github/workflows/digest.yml` | Weekly Action: runs `digest.js`, comments on the open issue labelled `digest` (creates the label and issue if missing). |
| `data/{github,models,spaces}.json` | Today's lists. `github`: `repos`; `models`: `trending`, `small` (text-generation up to 8B or distilled); `spaces`: `trending`, `webml` (webml-community). Committed by the Action; never edit by hand. |
| `data/history.json` | 90-day log keyed by source → id → `[{d,v,r}]`: day, cumulative metric, rank on its list that day or `null` when only followed. One entry per day, latest wins. Sources: `github` (stars), `models` (likes), `spaces` (likes). The old `huggingface` bucket (30-day download counts) is no longer appended and ages out after 90 days. No rebuild path: the committed file is the record. |
| `data/catalog.json` | source → id → url, description and source-specific fields, for every item in history, including ones no longer listed. Models carry `baseModels` (from `base_model:` Hub tags); Spaces carry `models` (the models they declare, empty when more than 8). |
| `data/judgments.json` | `model` plus `github` → repo → `{kind, p, d}`. Jev output, kept apart from observations. |
| `rules.js` | Derivations shared by the page and `digest.js`: `hiddenKind` (collection/learning at p ≥ 0.7), `windowGain`, `growth` (7-day gain, pace vs the 3 weeks before, first seen, last ranked), number formatting. |
| `links.js` | `crossSourceGroups()`: related tracked items, joined by a Space's declared models, a model's declared base model, or (across sources only) the same owner with a matching name. Links chain. Keeps groups spanning two or more sources with a member listed in the last 7 days. |
| `overview.js` | The All tab: each source's top 5 by daily rate side by side, then the cross-source groups as member rows. |
| `rows.js` | `TABS` (per source: label, metric, sections, row facts) and `buildRow()`. |
| `trace.js` | `buildTrace()` (one item's history as SVG on the tab's date axis) and `renderGains()` (fastest-growing bars). |
| `tools.js` | `TOOL_DEFS`, the WebMCP tool surface (name, description, `annotations.readOnlyHint`, JSON schema, `execute`), and `registerWebMCPTools()`. |
| `index.js` | `pulse` page state and actions (called by tools), `render()`, tabs, hide toggle, theme toggle, agent-tools panel, data load, view transitions. |
| `index.html` | Shell and layout. Only external resource is Google Fonts. |
| `index.css` | All styles. CSS custom properties for theming, light and dark. |

## Data flow

1. `fetch-trending.yml` runs `scripts/fetch.js` daily at 05:17 UTC.
2. For each source, `fetch.js` writes `data/<source>.json`, records every listed item in `history.json` with its rank, and refreshes its catalog entry.
3. Items that were listed within the last 30 days but are not listed today are fetched individually and recorded with `r: null`. A source whose list fetch failed is not followed that run.
4. GitHub repos without a judgment are sent to Jev (`jev-1.13.0`, https://docs.typesafe.ai) once, as a choice among project, collection, learning, unclear. Requires the `TYPESAFE_API_KEY` repo secret; without it judging is skipped.
5. Observations older than 90 days are pruned; catalog entries and judgments without history are dropped.
6. The Action commits `data/` with `[skip ci]`.
7. The static page fetches `data/*.json` on load.
8. `digest.yml` runs `scripts/digest.js` on Mondays at 08:00 UTC and posts the output as a comment on the open issue labelled `digest`.

## Local development

```bash
# Fetch data once (set TYPESAFE_API_KEY to judge new repos)
node scripts/fetch.js

# Serve (required: fetch() does not work over file://)
python3 -m http.server 8080
# or
npx serve .

# Print the digest
node scripts/digest.js
```

In Chrome stable, ordinary visitors get `document.modelContext` only through the WebMCP origin trial (a token served in the page) or `chrome://flags/#enable-webmcp-testing`. Without it the page renders and the agent panel reports the tools as not registered.

## Adding a new tool

1. Add an entry to `TOOL_DEFS` in `tools.js` (name, description, `annotations.readOnlyHint`, JSON schema, `execute` handler). Put state or actions it needs on `pulse` in `index.js`.
2. It registers automatically via `registerWebMCPTools()` and appears in the agent-tools panel.

## GitHub Action notes

- `fetch-trending.yml` also runs on pushes to `main` that change `scripts/fetch.js`.
- `concurrency` uses `cancel-in-progress: true`: a new fetch run cancels one still in flight rather than queueing behind it.
- Commit skipped (via `git diff --staged --quiet`) if data hasn't changed.
- `[skip ci]` in the commit message prevents triggering another workflow run.
- `GITHUB_TOKEN` is passed to `fetch.js` so follow-up star counts get the authenticated API rate limit.
- Both workflows have `workflow_dispatch` for manual runs.

## Design rules

- **Filter before sources.** Adding a source without a stronger filter adds noise, not signal.
- The page and the digest derive gains and hiding from `rules.js`; don't reimplement either side.

### Visualization

- Time windows must be labeled. Row gains show their actual span ("+1.2k in 5d"), never a presumed window; the digest omits the span only when it is exactly 7 days.
- Traces share one 90-day date axis per tab so rows line up in time; solid where the item was on its list that day, dotted where it was only followed; y is scaled per row, so the trace shows shape and the gain column shows size. Hover surfaces the values, dates, and listed days in a `<title>`.
- Bars start at zero (delta encoding requires it). Lines do not.
- Stars and likes are different units: the All tab never ranks items from different sources against each other; each source keeps its own scale.
- A name-matched link is a heuristic; the group row states which evidence joined each member.

### Motion

- Motion reports a state change the reader caused (tab, theme, pick, panel, disclosure); nothing animates on its own or loops.
- Ease out, 120–320ms (`--t-fast`, `--t`, `--t-slow`). Tab and theme changes crossfade through a same-document view transition, the masthead excluded so the tab underline slides live.
- `prefers-reduced-motion: reduce` removes every transition and animation, and `transition()` skips the view transition.
- LLM-generated judgments, themes or clusters are model output: they must be visibly distinguishable from raw observations (labelled with the model and p), and must keep the source items reachable.
