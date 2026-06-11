// GET /api/games — today's NBA games from NBA CDN (free, no key)
export const revalidate = 300;

export async function GET() {
  try {
    const r = await fetch(
      "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
      { next: { revalidate: 300 } }
    );
    if (!r.ok) return Response.json({ games: [] });
    const data = await r.json();
    const games = (data.scoreboard?.games || []).map((g) => ({
      id: g.gameId,
      home: g.homeTeam.teamTricode,
      away: g.awayTeam.teamTricode,
      homeName: g.homeTeam.teamName,
      awayName: g.awayTeam.teamName,
      status: g.gameStatusText,
      homeId: g.homeTeam.teamId,
      awayId: g.awayTeam.teamId,
    }));
    return Response.json({ games });
  } catch {
    return Response.json({ games: [] });
  }
}
