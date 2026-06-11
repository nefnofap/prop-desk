// GET /api/logs?playerId=123&n=20 — NBA.com game logs, no key required
import { NBA_HEADERS, CURRENT_SEASON } from "../../../lib/nba";
export const revalidate = 900;

const parseRows = (rows, postseason) =>
  // NBA.com playergamelog headers (indices):
  // 3=GAME_DATE, 4=MATCHUP, 6=MIN, 10=FG3M, 18=REB, 19=AST, 20=STL, 21=BLK, 22=TOV, 24=PTS
  rows.map((r) => ({
    date: r[3],
    matchup: r[4],
    min: r[6] || "0",
    pts: r[24] ?? 0,
    reb: r[18] ?? 0,
    ast: r[19] ?? 0,
    stl: r[20] ?? 0,
    blk: r[21] ?? 0,
    fg3m: r[10] ?? 0,
    turnover: r[22] ?? 0,
    postseason,
  }));

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const playerId = sp.get("playerId");
  const n = Math.min(Number(sp.get("n") || 20), 50);
  if (!playerId) return Response.json({ error: "missing playerId" }, { status: 400 });

  const base = `https://stats.nba.com/stats/playergamelog?PlayerID=${playerId}&Season=${CURRENT_SEASON}&LeagueID=00`;
  const [regRes, poRes] = await Promise.all([
    fetch(`${base}&SeasonType=Regular+Season`, { headers: NBA_HEADERS }),
    fetch(`${base}&SeasonType=Playoffs`, { headers: NBA_HEADERS }),
  ]);

  if (!regRes.ok && !poRes.ok)
    return Response.json({ error: `NBA.com returned ${regRes.status}` }, { status: 502 });

  const reg = regRes.ok ? parseRows((await regRes.json()).resultSets?.[0]?.rowSet || [], false) : [];
  const po = poRes.ok ? parseRows((await poRes.json()).resultSets?.[0]?.rowSet || [], true) : [];

  // NBA.com returns newest-first already; playoffs first so they weight more recent
  const logs = [...po, ...reg]
    .filter((g) => g.min && g.min !== "0" && g.min !== "00" && g.min !== "0:00")
    .slice(0, n);

  if (!logs.length) return Response.json({ error: "No game logs found — player may not have played this season." }, { status: 404 });
  return Response.json({ logs });
}
