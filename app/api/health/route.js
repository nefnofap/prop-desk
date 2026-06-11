// GET /api/health — checks NBA.com connectivity (no key needed anymore)
import { NBA_HEADERS, CURRENT_SEASON } from "../../../lib/nba";
export const dynamic = "force-dynamic";

export async function GET() {
  const check = async (url) => {
    try {
      const r = await fetch(url, { headers: NBA_HEADERS, cache: "no-store" });
      return r.status;
    } catch (e) { return `error: ${e.message}`; }
  };

  const players = await check(`https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${CURRENT_SEASON}&IsOnlyCurrentSeason=1`);
  // Wembanyama's player ID on NBA.com is 1641705
  const logs = await check(`https://stats.nba.com/stats/playergamelog?PlayerID=1641705&Season=${CURRENT_SEASON}&SeasonType=Playoffs&LeagueID=00`);

  const ok = players === 200 && logs === 200;
  return Response.json({
    dataSource: "NBA.com stats API (no key required)",
    playersEndpoint: players,
    logsEndpoint: logs,
    verdict: ok
      ? "All good — search a player to start."
      : `NBA.com issue — players: ${players}, logs: ${logs}. This is usually a temporary rate-limit; try again in 30 seconds.`,
  });
}
