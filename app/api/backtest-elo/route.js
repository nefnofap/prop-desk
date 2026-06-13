// GET /api/backtest-elo — walk-forward Elo backtest on this season's NBA games.
// Out-of-sample by construction: each game is predicted from ratings built on PRIOR games only,
// then ratings update. No look-ahead. Reports sample size + baselines so results are judgeable.
import { ESPN_BASE, UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOME_ADV = 100;   // Elo points added to home team (538-style)
const K = 20;           // update speed
const START = 1500;

function expectedHome(rHome, rAway) {
  return 1 / (1 + Math.pow(10, ((rAway) - (rHome + HOME_ADV)) / 400));
}

export async function GET() {
  // 1. get all team IDs
  let teamIds = [];
  try {
    const r = await fetch(`${ESPN_BASE}/teams`, { headers: UA, cache: "no-store" });
    const d = await r.json();
    const list = d.sports?.[0]?.leagues?.[0]?.teams || [];
    teamIds = list.map(t => t.team?.id).filter(Boolean);
  } catch (e) {
    return Response.json({ error: `teams fetch failed: ${e.message}` });
  }
  if (!teamIds.length) return Response.json({ error: "no team ids" });

  // 2. pull every team's schedule, collect completed games, dedupe by event id
  const gamesById = {};
  await Promise.all(teamIds.map(async (id) => {
    try {
      const r = await fetch(`${ESPN_BASE}/teams/${id}/schedule`, { headers: UA, cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      for (const ev of d.events || []) {
        const comp = ev.competitions?.[0];
        if (!comp?.status?.type?.completed) continue;
        const home = comp.competitors.find(c => c.homeAway === "home");
        const away = comp.competitors.find(c => c.homeAway === "away");
        if (!home || !away) continue;
        const hs = Number(home.score?.value ?? home.score);
        const as = Number(away.score?.value ?? away.score);
        if (isNaN(hs) || isNaN(as) || hs === as) continue;
        gamesById[ev.id] = {
          date: ev.date,
          homeId: home.team?.id, awayId: away.team?.id,
          homeWon: hs > as,
        };
      }
    } catch {}
  }));

  const games = Object.values(gamesById).sort((a, b) => new Date(a.date) - new Date(b.date));
  const n = games.length;
  if (n < 20) return Response.json({ error: `only ${n} games found — too few to backtest`, n });

  // 3. walk-forward Elo
  const rating = {};
  const get = (id) => (rating[id] == null ? (rating[id] = START) : rating[id]);

  let correct = 0, homeBaseline = 0, brier = 0;
  const buckets = {}; // calibration: predicted-prob bucket → {pred, won}
  // burn-in: skip first ~15% of games for accuracy stats (ratings still stabilizing)
  const burn = Math.floor(n * 0.15);

  games.forEach((g, i) => {
    const rH = get(g.homeId), rA = get(g.awayId);
    const pHome = expectedHome(rH, rA);          // predicted P(home win) BEFORE seeing result
    const scored = i >= burn;

    if (scored) {
      const predHomeWin = pHome >= 0.5;
      if (predHomeWin === g.homeWon) correct++;
      homeBaseline += g.homeWon ? 1 : 0;          // "always pick home" baseline
      brier += Math.pow(pHome - (g.homeWon ? 1 : 0), 2);
      const b = Math.floor(pHome * 10) / 10;      // 0.0..0.9 buckets
      buckets[b] = buckets[b] || { pred: 0, won: 0, count: 0 };
      buckets[b].pred += pHome; buckets[b].won += g.homeWon ? 1 : 0; buckets[b].count++;
    }

    // update
    const sHome = g.homeWon ? 1 : 0;
    rating[g.homeId] = rH + K * (sHome - pHome);
    rating[g.awayId] = rA + K * ((1 - sHome) - (1 - pHome));
  });

  const scoredN = n - burn;
  const acc = correct / scoredN;
  const homeRate = homeBaseline / scoredN;
  const brierAvg = brier / scoredN;

  // calibration table
  const calib = Object.entries(buckets).sort((a, b) => a[0] - b[0]).map(([b, v]) => ({
    predicted: `${(b * 100).toFixed(0)}-${(Number(b) * 100 + 10).toFixed(0)}%`,
    avgPredicted: `${(v.pred / v.count * 100).toFixed(0)}%`,
    actualWon: `${(v.won / v.count * 100).toFixed(0)}%`,
    n: v.count,
  }));

  // top/bottom current ratings for sanity
  const ranked = Object.entries(rating).sort((a, b) => b[1] - a[1]);

  return Response.json({
    method: "Walk-forward Elo (predict-before-update, no look-ahead)",
    season_games_used: n,
    games_scored: scoredN,
    burn_in_skipped: burn,
    elo_winner_accuracy: `${(acc * 100).toFixed(1)}%`,
    home_team_baseline: `${(homeRate * 100).toFixed(1)}%`,
    brier_score: brierAvg.toFixed(3),
    literature_benchmark: "~65% (multiple published NBA Elo studies)",
    honest_notes: [
      `Sample is ONE season (${n} games). Wide confidence interval — treat as indicative, not proven.`,
      "Accuracy is for predicting the WINNER, which is not the same as beating the spread or making profit.",
      "Published research: Elo ~65% on winners but roughly break-even against the point spread after vig.",
      "Brier score: lower is better calibration; 0.25 = coin flip, <0.21 is decent for NBA.",
    ],
    calibration: calib,
    top_rated_now: ranked.slice(0, 5).map(([id, r]) => `team ${id}: ${Math.round(r)}`),
  });
}
