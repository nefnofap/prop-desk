// GET /api/player?q=wemban — NBA.com player search, no key required
import { NBA_HEADERS, CURRENT_SEASON } from "../../../lib/nba";
export const revalidate = 3600;

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").toLowerCase().trim();
  if (!q || q.length < 2) return Response.json({ error: "query too short" }, { status: 400 });

  const r = await fetch(
    `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${CURRENT_SEASON}&IsOnlyCurrentSeason=0`,
    { headers: NBA_HEADERS }
  );
  if (!r.ok) return Response.json({ error: `NBA.com ${r.status}` }, { status: 502 });

  const data = await r.json();
  // indices: 0=PERSON_ID, 2=DISPLAY_FIRST_LAST, 11=TEAM_ABBREVIATION, 14=GAMES_PLAYED_FLAG
  const rows = data.resultSets?.[0]?.rowSet || [];
  const players = rows
    .filter((row) => row[2].toLowerCase().includes(q))
    .slice(0, 10)
    .map((row) => ({ id: row[0], name: row[2], team: row[11] || "", position: "" }));

  return Response.json({ players });
}
