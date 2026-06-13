// GET /api/backtest-props?teamId=24&date=2026-05-13&minHits=6
// Walk-forward player-prop backtest. For each rostered player:
//   - "prior" games = strictly BEFORE the test date  → used to set the line + pick best bet
//   - "result" game = the player's game ON the test date → used to GRADE (never seen by the picker)
// No look-ahead. Reports per-leg hit/miss + overall screen hit rate.
import { ESPN_BASE, ESPN_WEB, UA } from "../../../lib/espn";
import { STAT_TYPES, weightedShrunkProb } from "../../../lib/engine";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOOK_MIN_LINE = {
  pts: 5.5, reb: 2.5, ast: 1.5, pra: 9.5, pr: 6.5, pa: 6.5, ra: 3.5,
  stl: 0.5, blk: 0.5, bs: 1.5, fg3m: 0.5, to: 0.5,
};

const made = (cell) => {
  if (cell == null) return 0;
  const s = String(cell);
  return s.includes("-") ? Number(s.split("-")[0]) || 0 : Number(s) || 0;
};

async function getLogs(playerId) {
  const res = await fetch(`${ESPN_WEB}/athletes/${playerId}/gamelog`, { headers: UA, cache: "no-store" });
  if (!res.ok) return [];
  const d = await res.json();
  const labels = (d.labels || []).map((s) => String(s).toUpperCase());
  const ix = (k) => labels.indexOf(k);
  const iMIN = ix("MIN"), i3PT = ix("3PT"), iREB = ix("REB"), iAST = ix("AST"),
        iBLK = ix("BLK"), iSTL = ix("STL"), iTO = ix("TO"), iPTS = ix("PTS");
  const meta = d.events || {};
  const logs = [];
  for (const st of d.seasonTypes || []) {
    for (const cat of st.categories || []) {
      for (const ev of cat.events || []) {
        const s = ev.stats || [];
        if (!s.length) continue;
        const m = meta[ev.eventId] || {};
        if (!m.gameDate) continue;
        logs.push({
          date: m.gameDate,
          ts: new Date(m.gameDate).getTime(),
          min: iMIN >= 0 ? s[iMIN] : "0",
          pts: iPTS >= 0 ? Number(s[iPTS]) || 0 : 0,
          reb: iREB >= 0 ? Number(s[iREB]) || 0 : 0,
          ast: iAST >= 0 ? Number(s[iAST]) || 0 : 0,
          stl: iSTL >= 0 ? Number(s[iSTL]) || 0 : 0,
          blk: iBLK >= 0 ? Number(s[iBLK]) || 0 : 0,
          turnover: iTO >= 0 ? Number(s[iTO]) || 0 : 0,
          fg3m: i3PT >= 0 ? made(s[i3PT]) : 0,
        });
      }
    }
  }
  return logs.filter(g => g.min && g.min !== "0" && g.min !== "--" && g.min !== "0:00");
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const teamId = sp.get("teamId");
  const dateStr = sp.get("date");
  const minHits = Number(sp.get("minHits") || 6);
  const window = Math.min(Number(sp.get("window") || 10), 20);
  if (!teamId || !dateStr) return Response.json({ error: "need teamId and date (YYYY-MM-DD)" }, { status: 400 });

  const cutoff = new Date(dateStr + "T00:00:00Z").getTime();
  const dayEnd = cutoff + 36 * 3600 * 1000; // test-date window (~1.5 days to catch the game)

  // roster
  let roster = [];
  try {
    const r = await fetch(`${ESPN_BASE}/teams/${teamId}/roster`, { headers: UA, cache: "no-store" });
    const d = await r.json();
    roster = (d.athletes || []).flatMap(g => g.items || g).map(a => ({ id: a.id, name: a.displayName })).filter(x => x.id);
  } catch (e) {
    return Response.json({ error: `roster failed: ${e.message}` }, { status: 502 });
  }
  if (!roster.length) return Response.json({ error: "no roster" }, { status: 404 });

  const picks = [];
  let graded = 0, hit = 0;

  for (const pl of roster.slice(0, 15)) {
    let logs;
    try { logs = await getLogs(pl.id); } catch { continue; }
    if (!logs.length) continue;

    const prior = logs.filter(g => g.ts < cutoff).sort((a, b) => b.ts - a.ts);
    const resultGame = logs.find(g => g.ts >= cutoff && g.ts < dayEnd);
    if (prior.length < 5 || !resultGame) continue; // need history AND a game that day

    // pick this player's single best bet from PRIOR data only
    let best = null;
    for (const [key, def] of Object.entries(STAT_TYPES)) {
      const vals = prior.slice(0, window).map(def.calc);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const floor = BOOK_MIN_LINE[key] || 0.5;
      if (avg < floor) continue;
      const line = Math.max(floor, Math.round((avg - 0.25) * 2) / 2);
      const over = weightedShrunkProb(vals, line, "over");
      const under = weightedShrunkProb(vals, line, "under");
      const side = over.p >= under.p ? "over" : "under";
      const chosen = side === "over" ? over : under;
      if (chosen.hits < minHits) continue;            // ONLY 6+/7+ etc.
      if (!best || chosen.p > best.p) best = { key, label: def.label, line, side, p: chosen.p, hits: chosen.hits, n: chosen.n };
    }
    if (!best) continue;

    // grade against the ACTUAL result game (never seen by picker)
    const actual = STAT_TYPES[best.key].calc(resultGame);
    const won = best.side === "over" ? actual > best.line : actual < best.line;
    graded++; if (won) hit++;
    picks.push({
      player: pl.name, stat: best.label, side: best.side, line: best.line,
      priorHitRate: `${best.hits}/${best.n}`, modeledProb: `${(best.p * 100).toFixed(0)}%`,
      actual, result: won ? "HIT ✓" : "MISS ✗",
    });
  }

  return Response.json({
    method: "Walk-forward: picks use ONLY games before the date; graded on the actual game that day.",
    testDate: dateStr,
    minHitsFilter: `${minHits}+`,
    playersWithPickAndResult: graded,
    legsHit: hit,
    screenHitRate: graded ? `${(hit / graded * 100).toFixed(1)}%` : "n/a",
    parlayWouldHaveCashed: graded > 0 && hit === graded,
    honest_notes: [
      "Lines are the APP's own (near each player's average), NOT 747's real lines — so this tests the screen's consistency, not whether you beat 747.",
      "Sample is whatever games ESPN's free feed still serves; if playersWithPickAndResult is small, treat as anecdote not proof.",
      "Per-leg hit rate is the real signal. A full-parlay 'cashed' on one date is one coin-flip sequence, not evidence.",
    ],
    picks,
  });
}
