// GET /api/logs?playerName=Victor+Wembanyama&n=20
// Resolves player name → NBA.com person ID → game logs
import { NBA_HEADERS, CURRENT_SEASON } from "../../../lib/nba";
export const revalidate = 900;

async function resolveNbaId(playerName) {
  const r = await fetch(
    `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${CURRENT_SEASON}&IsOnlyCurrentSeason=1`,
    { headers: NBA_HEADERS, next: { revalidate: 3600 } }
  );
  if (!r.ok) throw new Error(`NBA.com player list returned ${r.status}`);
  const data = await r.json();
  const rows = data.resultSets?.[0]?.rowSet || [];
  // 0=PERSON_ID, 2=DISPLAY_FIRST_LAST
  const name = playerName.toLowerCase().trim();
  const match =
    rows.find((r) => r[2].toLowerCase() === name) ||
    rows.find((r) => r[2].toLowerCase().includes(name.split(" ").slice(-1)[0]));
  if (!match) throw new Error(`"${playerName}" not found in NBA.com active roster`);
  return match[0];
}

const parseRows = (rows, postseason) =>
  rows.map((r) => ({
    date: r[3], matchup: r[4], min: r[6] || "0",
    pts: r[24] ?? 0, reb: r[18] ?? 0, ast: r[19] ?? 0,
    stl: r[20] ?? 0, blk: r[21] ?? 0, fg3m: r[10] ?? 0,
    turnover: r[22] ?? 0, postseason,
  }));

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const playerName = sp.get("playerName");
  const n = Math.min(Number(sp.get("n") || 20), 50);
  if (!playerName) return Response.json({ error: "missing playerName" }, { status: 400 });

  let nbaId;
  try { nbaId = await resolveNbaId(playerName); }
  catch (e) { return Response.json({ error: e.message }, { status: 502 }); }

  const base = `https://stats.nba.com/stats/playergamelog?PlayerID=${nbaId}&Season=${CURRENT_SEASON}&LeagueID=00`;
  const [regRes, poRes] = await Promise.all([
    fetch(`${base}&SeasonType=Regular+Season`, { headers: NBA_HEADERS }),
    fetch(`${base}&SeasonType=Playoffs`, { headers: NBA_HEADERS }),
  ]);

  if (!regRes.ok && !poRes.ok)
    return Response.json({ error: `NBA.com game logs: ${regRes.status} — NBA.com may be blocking server requests. This is a known issue with cloud hosting.` }, { status: 502 });

  const reg = regRes.ok ? parseRows((await regRes.json()).resultSets?.[0]?.rowSet || [], false) : [];
  const po = poRes.ok ? parseRows((await poRes.json()).resultSets?.[0]?.rowSet || [], true) : [];

  const logs = [...po, ...reg]
    .filter((g) => g.min && g.min !== "0" && g.min !== "00" && g.min !== "0:00")
    .slice(0, n);

  if (!logs.length) return Response.json({ error: `No game logs found for ${playerName} this season.` }, { status: 404 });
  return Response.json({ logs, nbaId });
}
