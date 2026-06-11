// GET /api/logs?playerId=123&season=2025&n=20 → recent game logs, newest first
export const revalidate = 900; // cache 15 min — keeps free-tier rate limits safe

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const playerId = sp.get("playerId");
  const season = sp.get("season") || "2025"; // balldontlie season = start year
  const n = Math.min(Number(sp.get("n") || 20), 50);
  if (!playerId) return Response.json({ error: "missing playerId" }, { status: 400 });

  const r = await fetch(
    `https://api.balldontlie.io/v1/stats?player_ids[]=${playerId}&seasons[]=${season}&per_page=100&postseason=true`,
    { headers: { Authorization: process.env.BALLDONTLIE_API_KEY || "" } }
  );
  if (!r.ok) return Response.json({ error: `balldontlie ${r.status} — check BALLDONTLIE_API_KEY` }, { status: 502 });
  const post = await r.json();

  // also pull regular season so early-season / non-playoff players still have data
  const r2 = await fetch(
    `https://api.balldontlie.io/v1/stats?player_ids[]=${playerId}&seasons[]=${season}&per_page=100&postseason=false`,
    { headers: { Authorization: process.env.BALLDONTLIE_API_KEY || "" } }
  );
  const reg = r2.ok ? await r2.json() : { data: [] };

  const all = [...(post.data || []), ...(reg.data || [])]
    .filter((g) => g.min && g.min !== "0" && g.min !== "00")
    .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
    .slice(0, n)
    .map((g) => ({
      date: g.game.date.slice(0, 10),
      vs: g.game.home_team_id === g.team.id ? "vs" : "@",
      pts: g.pts, reb: g.reb, ast: g.ast, stl: g.stl, blk: g.blk,
      fg3m: g.fg3m, turnover: g.turnover, min: g.min,
      postseason: g.game.postseason,
    }));

  return Response.json({ logs: all });
}
