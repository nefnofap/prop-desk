// GET /api/debug-team2?teamId=24 — dump ALL defensive + general stat names to find 'allowed' metrics
import { UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const teamId = new URL(request.url).searchParams.get("teamId") || "24";
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`;
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  if (!r.ok) return Response.json({ status: r.status });
  const d = await r.json();
  const cats = d.results?.stats?.categories || [];
  // dump every stat name across all categories so we can find points-allowed etc.
  const dump = {};
  for (const c of cats) {
    dump[c.name] = (c.stats || []).map(s => `${s.name} = ${s.displayValue ?? s.value ?? s.perGameValue}`);
  }
  return Response.json(dump);
}
