// GET /api/roster?teamId=1610612759 — active roster from NBA.com
import { NBA_HEADERS, CURRENT_SEASON } from "../../../lib/nba";
export const revalidate = 3600;

export async function GET(request) {
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) return Response.json({ error: "missing teamId" }, { status: 400 });
  const r = await fetch(
    `https://stats.nba.com/stats/commonteamroster?TeamID=${teamId}&Season=${CURRENT_SEASON}&LeagueID=00`,
    { headers: NBA_HEADERS }
  );
  if (!r.ok) return Response.json({ error: `NBA.com ${r.status}` }, { status: 502 });
  const d = await r.json();
  // headers: 0=TeamID,1=SEASON,2=LeagueID,3=PLAYER,4=NICKNAME,5=PLAYER_SLUG,6=NUM,7=POSITION,8=HEIGHT,9=WEIGHT,10=BIRTH_DATE,11=AGE,12=EXP,13=SCHOOL,14=PLAYER_ID
  const rows = d.resultSets?.[0]?.rowSet || [];
  const players = rows.map((r) => ({ id: r[14], name: r[3], position: r[7], num: r[6] }));
  return Response.json({ players });
}
