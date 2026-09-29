// Groups tracked items related across sources: a model, the models built on it, the Spaces that
// use them, a repo from the same owner under a matching name. Links chain, so two members of a group
// can be related only through a third. Shared by the page and Node scripts.

// Evidence for a link, strongest first. `uses` and `base` are declared in Hugging Face metadata;
// `named` is a heuristic and says so wherever it is shown.
const LINK_REASONS = {
  uses: 'the Space declares it uses the model',
  base: 'the model declares it as its base model',
  named: 'same owner and a matching name',
};

// On a tie, the hub is the model: it is what repos ship and Spaces demo.
const HUB_ORDER = ['models', 'github', 'spaces'];

const nameTokens = name => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const squash = name => nameTokens(name).join('');
const words = name => nameTokens(name).filter(t => /^[a-z]{3,}$/.test(t)).sort().join(' ');

// Same owner, and one name extends the other (LTX-2 / LTX-2.5, laya / laya-demo) or both use the
// same words once version numbers are dropped (Nemotron-3-Diarization / nemotron-diarization).
function namesMatch(a, b) {
  const [ownerA, nameA] = a.split('/');
  const [ownerB, nameB] = b.split('/');
  if (!nameA || !nameB || ownerA.toLowerCase() !== ownerB.toLowerCase()) return false;
  const [x, y] = [squash(nameA), squash(nameB)].sort((p, q) => p.length - q.length);
  if (x.length >= 4 && y.startsWith(x)) return true;
  const w = words(nameA);
  return w.length >= 4 && w === words(nameB);
}

// history: {github, models, spaces} → {[id]: obs[]}; catalog: same shape → {[id]: entry}.
// Returns groups spanning at least two sources with a member ranked on its list within `recentDays`
// of `today`, newest activity first. Each group: {members: [{source, id}], links: [{a, b, reason}]}.
function crossSourceGroups(history, catalog, today, recentDays = 7) {
  const key = (source, id) => `${source}\t${id}`;
  const tracked = new Set();
  for (const source of ['github', 'models', 'spaces']) for (const id of Object.keys(history[source] || {})) tracked.add(key(source, id));

  const parent = new Map([...tracked].map(k => [k, k]));
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const links = [];
  const pairs = new Set();
  const link = (a, b, reason) => {
    const pair = [a, b].sort().join('\n');
    if (a === b || !tracked.has(a) || !tracked.has(b) || pairs.has(pair)) return;
    pairs.add(pair);
    links.push({ a, b, reason });
    parent.set(find(a), find(b));
  };

  for (const [id, entry] of Object.entries(catalog.spaces || {})) for (const m of entry.models || []) link(key('spaces', id), key('models', m), 'uses');
  for (const [id, entry] of Object.entries(catalog.models || {})) for (const m of entry.baseModels || []) link(key('models', id), key('models', m), 'base');

  // Name matching only across sources: within one source, same-owner siblings are a model family.
  const bySource = ['github', 'models', 'spaces'].map(s => Object.keys(history[s] || {}).map(id => [s, id]));
  for (let i = 0; i < bySource.length; i++) for (let j = i + 1; j < bySource.length; j++) {
    for (const [sa, a] of bySource[i]) for (const [sb, b] of bySource[j]) if (namesMatch(a, b)) link(key(sa, a), key(sb, b), 'named');
  }

  const groups = new Map();
  for (const k of tracked) {
    const root = find(k);
    (groups.get(root) ?? groups.set(root, []).get(root)).push(k);
  }

  const since = shiftDay(today, -recentDays);
  const split = k => { const [source, id] = k.split('\t'); return { source, id }; };
  const lastRanked = ({ source, id }) => [...history[source][id]].reverse().find(o => o.r != null)?.d ?? '';
  return [...groups.values()]
    .map(ks => {
      const members = ks.map(split);
      const inGroup = new Set(ks);
      const groupLinks = links.filter(l => inGroup.has(l.a));
      // The hub is the item the others point at most: the base model, the model the Spaces use.
      const degree = k => groupLinks.filter(l => l.a === k || l.b === k).length;
      const hub = [...ks].sort((a, b) => degree(b) - degree(a) || HUB_ORDER.indexOf(split(a).source) - HUB_ORDER.indexOf(split(b).source))[0];
      return {
        hub: split(hub),
        members,
        links: groupLinks.map(l => ({ a: split(l.a), b: split(l.b), reason: l.reason })),
        listedToday: members.filter(m => history[m.source][m.id].at(-1)?.d === today && history[m.source][m.id].at(-1).r != null).length,
        latest: members.map(lastRanked).sort().at(-1),
      };
    })
    .filter(g => new Set(g.members.map(m => m.source)).size >= 2 && g.latest >= since)
    .sort((a, b) => b.listedToday - a.listedToday || b.latest.localeCompare(a.latest) || b.members.length - a.members.length);
}

if (typeof module !== 'undefined') module.exports = { LINK_REASONS, namesMatch, crossSourceGroups };
