// GET /api/health — ESPN connectivity check
import { ESPN_BASE, ESPN_WEB, UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET() {
  const get = async (url) => {
    try {
      const r = await fetch(url, { headers: UA, cache: "no-store" });
      return r.status;
    } catch (e) { return `err:${e.message.slice(0,30)}`; }
  };
  // Wembanyama ESPN athlete id = 5104157
  const scoreboard = await get(`${ESPN_BASE}/scoreboard`);
  const gamelog = await get(`${ESPN_WEB}/athletes/5104157/gamelog`);
  const athletes = await get(`${ESPN_WEB}/athletes?limit=5&active=true`);
  const ok = scoreboard === 200 && gamelog === 200;
  return Response.json({
    dataSource: "ESPN public API (no key)",
    scoreboard, gamelog, athleteList: athletes,
    verdict: ok ? "All systems go — ESPN is reachable from Vercel."
      : `ESPN issue — scoreboard:${scoreboard}, gamelog:${gamelog}. Retry in 30s.`,
  });
}
