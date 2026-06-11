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
  fg3m: { label: "3-Pointers",  short: "3PM",  calc: (g) => g.fg3m },
  to:   { label: "Turnovers",   short: "TO",   calc: (g) => g.turnover },
};

// Decimal odds (primary — 747 format). 1.91 ≈ -110 American.
export const decimalToImplied = (d) => (d > 1 ? 1 / d : 0);
export const impliedToDecimal = (p) => (p > 0 ? 1 / p : 0);
// Keep American as fallback for internal calcs
export const americanToDecimal = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export const decimalToAmerican = (d) => (d >= 2 ? `+${Math.round((d - 1) * 100)}` : `-${Math.round(100 / (d - 1))}`);
export const impliedProb = (dec) => decimalToImplied(dec); // dec odds throughout

// Bayesian shrinkage toward 0.5. k=8 pseudo-obs means a 10/10 streak → 78%, not 100%.
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

// Auto-suggest best stat+line combos for a player given their logs
export function autoSuggest(logs, window, odds) {
  const used = logs.slice(0, window);
  return Object.entries(STAT_TYPES).map(([key, def]) => {
    const vals = used.map(def.calc).filter((v) => v != null && !isNaN(v));
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    // Line set just below median so we're not betting on a coin flip at the average
    const line = Math.max(0.5, Math.round((avg - 0.75) * 2) / 2);
    const { p, hits, n } = weightedShrunkProb(vals, line, "over");
    const edge = p - impliedProb(odds);
    return { key, label: def.label, short: def.short, line, p, hits, n, edge, avg };
  }).filter(Boolean).sort((a, b) => b.edge - a.edge);
}
