// Derivations the page and scripts/digest.js share, so the two never disagree.

// Below HIDE_MIN_P a judgment is shown but hides nothing.
const HIDDEN_KINDS = { collection: 'list', learning: 'course' };
const HIDE_MIN_P = 0.7;

function hiddenKind(judgment) {
  return judgment && HIDDEN_KINDS[judgment.kind] && judgment.p >= HIDE_MIN_P ? HIDDEN_KINDS[judgment.kind] : null;
}

const DAY_MS = 86_400_000;

function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / DAY_MS);
}

function shiftDay(d, days) {
  return new Date(new Date(d).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// Newest observation compared with the newest one at least `days` older. An item observed for less
// than `days` is compared with its first observation, and `span` says how many days that covers.
function windowGain(obs, days, endIndex = obs ? obs.length - 1 : -1) {
  if (!obs || endIndex < 1) return null;
  const end = obs[endIndex];
  const cutoff = shiftDay(end.d, -days);
  let base = obs[0];
  for (let i = endIndex - 1; i >= 0; i--) if (obs[i].d <= cutoff) { base = obs[i]; break; }
  const span = daysBetween(base.d, end.d);
  if (span < 1) return null;
  return { delta: end.v - base.v, span, from: base.d, to: end.d, now: end.v, baseIndex: obs.indexOf(base) };
}

// Weekly gain, plus how its daily pace compares with the three weeks before it (null when that
// earlier stretch is under a week or had no growth to compare against).
function growth(obs) {
  const week = windowGain(obs, 7);
  if (!week) return null;
  const prior = windowGain(obs, 21, week.baseIndex);
  const priorRate = prior && prior.span >= 7 && prior.delta > 0 ? prior.delta / prior.span : null;
  const lastRanked = [...obs].reverse().find(o => o.r != null);
  return {
    ...week,
    pace: priorRate ? (week.delta / week.span) / priorRate : null,
    firstSeen: obs[0].d,
    lastRanked: lastRanked ? lastRanked.d : null,
  };
}

function fmtSigned(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '+';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000)    return `${sign}${Math.round(abs / 1_000)}k`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${abs}`;
}

// Daily rates: a Space gaining three likes a week reads +0.4, not +0.
function fmtRate(r) {
  return Math.abs(r) < 9.95 ? `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(1)}` : fmtSigned(Math.round(r));
}

function fmtCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000)    return Math.round(n / 1_000) + 'k';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n ?? 0);
}

if (typeof module !== 'undefined') module.exports = { HIDDEN_KINDS, HIDE_MIN_P, hiddenKind, daysBetween, shiftDay, windowGain, growth, fmtSigned, fmtRate, fmtCount };
