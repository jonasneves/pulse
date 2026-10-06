# pulse

GitHub Pages dashboard tracking growth of GitHub trending repos (stars), Hugging Face trending models (likes), and Hugging Face trending Spaces (likes). Tools register with the browser through WebMCP (`document.modelContext`, falling back to `navigator.modelContext`) so an external agent can drive the view, instead of an embedded chat.

Open backlog and unshipped direction live in [issues](https://github.com/jonasneves/pulse/issues), not here.

## Layout

Flat files, no build step, no npm dependencies; keep concerns in separate files. Every `.js` file opens with a comment stating what it owns (`head -4 *.js scripts/*.js` is the map). `index.html`'s only external resource is Google Fonts; `index.css` holds all styles, themed light and dark with CSS custom properties. `scripts/fetch.js` runs daily and `scripts/digest.js` weekly from `.github/workflows/`; schedules, triggers, and commit behavior are in those files.

To add a WebMCP tool, add an entry to `TOOL_DEFS` in `tools.js` and put the state or actions it needs on `pulse` in `index.js`; it registers and appears in the agent-tools panel automatically.

## Data

Everything under `data/` is written by the daily Action. Never edit it by hand. `history.json` has no rebuild path: the committed file is the only record.

| File | Shape |
|------|-------|
| `{github,models,spaces}.json` | Today's lists. `github`: `repos`; `models`: `trending`, `small` (text-generation up to 8B or distilled); `spaces`: `trending`, `webml` (webml-community). |
| `history.json` | 90-day log keyed by source → id → `[{d,v,r}]`: day, cumulative metric, rank on its list that day, or `null` when the item was off the list and only followed (items listed in the last 30 days keep being observed). One entry per day, latest wins. Sources: `github` (stars), `models` (likes), `spaces` (likes). The old `huggingface` bucket (30-day download counts) is no longer appended and ages out after 90 days. |
| `catalog.json` | source → id → url, description and source-specific fields, for every item in history, including ones no longer listed. Models carry `baseModels` (from `base_model:` Hub tags); Spaces carry `models` (the models they declare, empty when more than 8). |
| `judgments.json` | `model` plus `github` → repo → `{kind, p, d}`. Jev output, kept apart from observations. |

Each new GitHub repo is judged once by Jev (TypeSafe's classifier model, https://docs.typesafe.ai) as project, collection, learning, or unclear. That needs the `TYPESAFE_API_KEY` repo secret; without it, judging is skipped.

## Local development

```bash
node scripts/fetch.js          # set TYPESAFE_API_KEY to judge new repos
python3 -m http.server 8080    # fetch() does not work over file://
node scripts/digest.js
```

In Chrome stable, visitors get `document.modelContext` only through the WebMCP origin trial (a token served in the page) or `chrome://flags/#enable-webmcp-testing`. Without it the page renders and the agent panel reports the tools as not registered.

## Design rules

- **Filter before sources.** Adding a source without a stronger filter adds noise, not signal.
- The page and the digest derive gains and hiding from `rules.js`; don't reimplement either side.
- LLM-generated judgments, themes or clusters are model output: they must be visibly distinguishable from raw observations (labelled with the model and p), and must keep the source items reachable.

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
