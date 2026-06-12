// Real math — computed from game logs, no LLM probabilities.

export const STAT_TYPES = {
  pts:  { label: "Points",      short: "PTS",  calc: (g) => g.pts },
  reb:  { label: "Rebounds",    short: "REB",  calc: (g) => g.reb },
  ast:  { label: "Assists",     short: "AST",  calc: (g) => g.ast },
  pra:  { label: "Pts+Reb+Ast", short: "PRA",  calc: (g) => g.pts + g.reb + g.ast },
  pr:   { label: "Pts+Reb",     short: "PR",   calc: (g) => g.pts + g.reb },
  pa:   { label: "Pts+Ast",     short: "PA",   calc: (g) => g.pts + g.ast },
  ra:   { label: "Reb+Ast",     short: "RA",   calc: (g) => g.reb + g.ast },
  stl:  { label: "Steals",      short: "STL",  calc: (g) => g.stl },
  blk:  { label: "Blocks",      short: "BLK",  calc: (g) => g.blk },
  bs:   { label: "Blocks+Steals", short: "B+S", calc: (g) => g.blk + g.stl },
  fg3m: { label: "3-Pointers",  short: "3PM",  calc: (g) => g.fg3m },
  to:   { label: "Turnovers",   short: "TO",   calc: (g) => g.turnover },
};

const BOOK_MIN_LINE = {
  pts: 7.5, reb: 3.5, ast: 2.5, pra: 14.5, pr: 9.5, pa: 9.5, ra: 5.5,
  stl: 1.5, blk: 1.5, bs: 2.5, fg3m: 1.5, to: 1.5,
};

export const decimalToImplied = (d) => (d > 1 ? 1 / d : 0);
export const impliedToDecimal = (p) => (p > 0 ? 1 / p : 0);
export const americanToDecimal = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export const decimalToAmerican = (d) => (d >= 2 ? `+${Math.round((d - 1) * 100)}` : `-${Math.round(100 / (d - 1))}`);
export const impliedProb = (dec) => decimalToImplied(dec);

export function weightedShrunkProb(values, line, side = "over", k = 8) {
  const n = values.length;
  if (!n) return { p: 0.5, hits: 0, n: 0 };
  let w = 0, wHits = 0;
  values.forEach((v, i) => {
    const weight = i < 5 ? 2 : 1;
    w += weight;
    if (side === "over" ? v > line : v < line) wHits += weight;
  });
  const hits = values.filter((v) => (side === "over" ? v > line : v < line)).length;
  const p = (wHits + k * 0.5) / (w + k);
  return { p, hits, n };
}

export function kellyStake(p, dec, bankroll, fraction = 0.25, cap = 0.03) {
  const b = dec - 1;
  const full = (b * p - (1 - p)) / b;
  return Math.min(Math.max(0, full * fraction), cap) * bankroll;
}

export function priceParlay(legs) {
  const dec = legs.reduce((a, l) => a * l.odds, 1);
  const naiveP = legs.reduce((a, l) => a * l.p, 1);
  const teams = legs.map((l) => l.team || "?");
  const extraSameTeam = legs.length - new Set(teams).size;
  const adjP = naiveP * Math.max(0.3, 1 - 0.1 * extraSameTeam);
  const ev = adjP * (dec - 1) - (1 - adjP);
  return { dec, naiveP, adjP, ev, extraSameTeam };
}

export function recommendParlays(legs) {
  const pos = [...legs].filter((l) => l.edge > 0).sort((a, b) => b.edge - a.edge);
  const tiers = [
    { name: "Safe",       emoji: "🛡", take: 2,  minEdge: 0.03 },
    { name: "Balanced",   emoji: "⚖️", take: 4,  minEdge: 0.02 },
    { name: "Aggressive", emoji: "🔥", take: 6,  minEdge: 0.01 },
    { name: "Lottery",    emoji: "🎰", take: 10, minEdge: 0.005 },
  ];
  const out = [];
  for (const t of tiers) {
    const picked = pos.filter((l) => l.edge >= t.minEdge).slice(0, t.take);
    if (picked.length >= 2 && !out.some((o) => o.legs.length === picked.length))
      out.push({ ...t, legs: picked });
  }
  return out;
}

export function evalLine(logs, window, stat, line, odds) {
  const def = STAT_TYPES[stat];
  const vals = logs.slice(0, window).map(def.calc).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const over = weightedShrunkProb(vals, line, "over");
  const under = weightedShrunkProb(vals, line, "under");
  const best = over.p >= under.p ? "over" : "under";
  const bestProb = Math.max(over.p, under.p);
  const edge = bestProb - impliedProb(odds);
  return {
    stat, label: def.label, short: def.short, line, avg, max, min, vals,
    over: over.p, under: under.p,
    overHits: over.hits, underHits: under.hits, n: over.n,
    best, bestProb, edge,
  };
}

export function isPropCandidate(logs, window) {
  const used = logs.slice(0, window);
  if (used.length < 5) return false;
  const avgPts = used.reduce((a, g) => a + g.pts, 0) / used.length;
  const avgMinNum = used.reduce((a, g) => {
    const m = parseInt(String(g.min).split(":")[0]) || 0;
    return a + m;
  }, 0) / used.length;
  return avgMinNum >= 18 || avgPts >= 8;
}

export function autoSuggest(logs, window, odds, opts = {}) {
  const { bettableOnly = true } = opts;
  if (bettableOnly && !isPropCandidate(logs, window)) return [];
  const used = logs.slice(0, window);

  return Object.entries(STAT_TYPES).map(([key, def]) => {
    const vals = used.map(def.calc).filter((v) => v != null && !isNaN(v));
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const floor = BOOK_MIN_LINE[key] || 0.5;
    if (bettableOnly && avg < floor) return null;

    const line = Math.max(floor, Math.round((avg - 0.25) * 2) / 2);
    const over = weightedShrunkProb(vals, line, "over");
    const under = weightedShrunkProb(vals, line, "under");
    const side = over.p >= under.p ? "over" : "under";
    const chosen = side === "over" ? over : under;
    const edge = chosen.p - impliedProb(odds);
    return {
      key, label: def.label, short: def.short, line, side,
      p: chosen.p, hits: chosen.hits, n: chosen.n, edge, avg,
    };
  }).filter(Boolean).sort((a, b) => b.edge - a.edge);
}

// ── Slip parser: reads pasted 747 slip text into structured legs ──
// Handles formats like:
//   "Player steals - O.G. Anunoby over 1.5 (Game)"
//   "Player blocks - Victor Wembanyama under 3.5"
//   "Victor Wembanyama under 28.5 points"
// Returns [{ raw, name, stat, side, line }] with stat resolved to a STAT_TYPES key.
const STAT_ALIASES = [
  { key: "fg3m", re: /three|3[\s-]?point|3pm|threes/i },
  { key: "pra", re: /points?\s*\+\s*assists?\s*\+\s*rebounds?|p\s*\+\s*a\s*\+\s*r|pra/i },
  { key: "pr", re: /points?\s*\+\s*rebounds?|p\s*\+\s*r\b|pr\b/i },
  { key: "pa", re: /points?\s*\+\s*assists?|p\s*\+\s*a\b|pa\b/i },
  { key: "ra", re: /rebounds?\s*\+\s*assists?|r\s*\+\s*a\b|ra\b/i },
  { key: "bs", re: /blocks?\s*\+\s*steals?|stocks/i },
  { key: "pts", re: /points?|pts/i },
  { key: "reb", re: /rebounds?|reb/i },
  { key: "ast", re: /assists?|ast/i },
  { key: "stl", re: /steals?|stl/i },
  { key: "blk", re: /blocks?|blk/i },
  { key: "to", re: /turnovers?|tov?\b/i },
];

function resolveStat(text) {
  for (const a of STAT_ALIASES) if (a.re.test(text)) return a.key;
  return null;
}

export function parseSlip(text) {
  const lines = text
    // split on newlines OR on "(Game)" boundaries so one-line pastes work too
    .replace(/\(Game[^)]*\)/gi, "\n")
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const out = [];
  for (const raw of lines) {
    const side = /\bunder\b|\bU\b/i.test(raw) ? "under" : /\bover\b|\bO\b/i.test(raw) ? "over" : null;
    const lineMatch = raw.match(/(\d+(?:\.\d+)?)/g);
    const line = lineMatch ? Number(lineMatch[lineMatch.length - 1]) : null;
    const stat = resolveStat(raw);

    // Player name: strip the "Player <stat> -" prefix and the side/line/stat words
    let name = raw
      .replace(/^player\s+[a-z+\s]+-\s*/i, "")     // "Player steals - "
      .replace(/\b(over|under)\b.*$/i, "")          // everything from over/under on
      .replace(/[-–—]/g, " ")
      .replace(/\b(points?|rebounds?|assists?|steals?|blocks?|three[\s-]?pointers?|turnovers?)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (name && stat && side && line != null) {
      out.push({ raw, name, stat, side, line });
    } else {
      out.push({ raw, name: name || raw, stat, side, line, error: true });
    }
  }
  return out;
}
