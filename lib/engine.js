// Real math. No LLM probabilities — everything here is computed from game logs.

export const STAT_TYPES = {
  pts: { label: "Points", calc: (g) => g.pts },
  reb: { label: "Rebounds", calc: (g) => g.reb },
  ast: { label: "Assists", calc: (g) => g.ast },
  stl: { label: "Steals", calc: (g) => g.stl },
  blk: { label: "Blocks", calc: (g) => g.blk },
  fg3m: { label: "3PM", calc: (g) => g.fg3m },
  to: { label: "Turnovers", calc: (g) => g.turnover },
  pra: { label: "Pts+Reb+Ast", calc: (g) => g.pts + g.reb + g.ast },
  pr: { label: "Pts+Reb", calc: (g) => g.pts + g.reb },
  pa: { label: "Pts+Ast", calc: (g) => g.pts + g.ast },
  ra: { label: "Reb+Ast", calc: (g) => g.reb + g.ast },
};

export const americanToDecimal = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export const impliedProb = (a) => 1 / americanToDecimal(a);

// Empirical probability with Bayesian shrinkage toward 0.5.
// k = pseudo-observations; with n=10 games and k=8, a 10/10 streak
// shrinks to (10+4)/(10+8) = 0.78, not a naive 1.0. Books set lines at
// medians, so small-sample streaks are mostly line placement, not edge.
export function shrunkProb(values, line, side = "over", k = 8) {
  const n = values.length;
  if (!n) return { p: 0.5, hits: 0, n: 0 };
  const hits = values.filter((v) => (side === "over" ? v > line : v < line)).length;
  const p = (hits + k * 0.5) / (n + k);
  return { p, hits, n };
}

// Recency-weighted variant: last 5 games count double.
export function weightedShrunkProb(values, line, side = "over", k = 8) {
  const n = values.length;
  if (!n) return { p: 0.5, hits: 0, n: 0 };
  let w = 0, wHits = 0;
  values.forEach((v, i) => {
    const weight = i < 5 ? 2 : 1; // values must be ordered most-recent-first
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

export function priceParlay(legs, haircutPerLeg = 0.1) {
  const dec = legs.reduce((a, l) => a * americanToDecimal(l.odds), 1);
  const naiveP = legs.reduce((a, l) => a * l.p, 1);
  const games = legs.map((l) => l.gameKey || "same");
  const extraSameGame = legs.length - new Set(games).size;
  const adjP = naiveP * Math.max(0.3, 1 - haircutPerLeg * extraSameGame);
  const ev = adjP * (dec - 1) - (1 - adjP);
  return { dec, naiveP, adjP, ev, extraSameGame };
}

// Auto-recommend parlays from positive-edge legs. Max 10 legs.
export function recommendParlays(legs) {
  const pos = legs.filter((l) => l.edge > 0).sort((a, b) => b.edge - a.edge);
  const tiers = [
    { name: "Safest", take: 2, minEdge: 0.03, note: "2 legs, strongest edges only" },
    { name: "Balanced", take: 4, minEdge: 0.02, note: "Up to 4 legs, edge ≥ 2%" },
    { name: "Aggressive", take: 6, minEdge: 0.01, note: "Up to 6 legs, edge ≥ 1%" },
    { name: "Lottery", take: 10, minEdge: 0.005, note: "Up to 10 legs — huge payout, tiny hit rate. Entertainment sizing only." },
  ];
  const out = [];
  for (const t of tiers) {
    const picked = pos.filter((l) => l.edge >= t.minEdge).slice(0, t.take);
    if (picked.length >= 2 && !out.some((o) => o.legs.length === picked.length))
      out.push({ name: t.name, note: t.note, legs: picked });
  }
  return out;
}
