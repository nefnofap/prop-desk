// GET /api/debug-odds?gameId=401809235 — inspect ESPN's odds shape for a game
import { UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const gameId = new URL(request.url).searchParams.get("gameId");
  if (!gameId) return Response.json({ error: "pass ?gameId= from /api/games" });
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  if (!r.ok) return Response.json({ error: `ESPN ${r.status}` });
  const d = await r.json();

  // Surface just the odds-relevant pieces
  const pick = d.pickcenter || d.againstTheSpread || [];
  const odds = (d.odds || []);
  return Response.json({
    hasPickcenter: !!d.pickcenter,
    pickcenterCount: (d.pickcenter || []).length,
    firstPickcenter: (d.pickcenter || [])[0] || null,
    oddsKeys: odds[0] ? Object.keys(odds[0]) : null,
    firstOdds: odds[0] || null,
    header: d.header ? {
      competitionsKeys: d.header.competitions?.[0] ? Object.keys(d.header.competitions[0]) : null,
      teams: d.header.competitions?.[0]?.competitors?.map(c => ({ abbrev: c.team?.abbreviation, homeAway: c.homeAway, score: c.score })),
    } : null,
  });
}
