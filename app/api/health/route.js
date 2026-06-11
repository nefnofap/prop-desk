// GET /api/health — full diagnostic
import { NBA_HEADERS, CURRENT_SEASON } from "../../../lib/nba";
export const dynamic = "force-dynamic";
const KEY = (process.env.BALLDONTLIE_API_KEY || "").trim();

export async function GET() {
  const get = async (url, headers = {}) => {
    try {
      const r = await fetch(url, { headers, cache: "no-store" });
      return r.status;
    } catch (e) { return `err:${e.message.slice(0,40)}`; }
  };

  const bdlPlayers = await get("https://api.balldontlie.io/v1/players?per_page=1", KEY ? { Authorization: KEY } : {});
  const nbaPlayers = await get(`https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${CURRENT_SEASON}&IsOnlyCurrentSeason=1`, NBA_HEADERS);
  // Wembanyama NBA ID = 1641705
  const nbaLogs = await get(`https://stats.nba.com/stats/playergamelog?PlayerID=1641705&Season=${CURRENT_SEASON}&SeasonType=Playoffs&LeagueID=00`, NBA_HEADERS);

  const searchWorks = bdlPlayers === 200;
  const logsWork = nbaLogs === 200;

  return Response.json({
    keyPresent: KEY.length > 0,
    bdlPlayerSearch: bdlPlayers,
    nbaComPlayerList: nbaPlayers,
    nbaComGameLogs: nbaLogs,
    verdict: !searchWorks
      ? `Player search broken (${bdlPlayers}) — check BALLDONTLIE_API_KEY in Vercel env vars.`
      : !logsWork
      ? `Search works but NBA.com game logs return ${nbaLogs} — NBA.com is blocking Vercel's IPs. Need alternative data source.`
      : "All systems go.",
  });
}
