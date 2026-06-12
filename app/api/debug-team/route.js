// GET /api/debug-team?teamId=24 — inspect ESPN team stats shape for defense context
import { ESPN_BASE, UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const teamId = new URL(request.url).searchParams.get("teamId") || "24";
  // Try the statistics endpoint
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`;
  let out = { tried: url };
  try {
    const r = await fetch(url, { headers: UA, cache: "no-store" });
    out.status = r.status;
    if (r.ok) {
      const d = await r.json();
      out.topKeys = Object.keys(d);
      // dig for defensive categories
      const cats = d.results?.stats?.categories || d.stats?.categories || d.categories || [];
      out.categoryNames = cats.map(c => c.name || c.displayName);
      // sample: find points allowed / opponent stats
      const defCat = cats.find(c => /defens|opponent|miscellaneous/i.test(c.name || c.displayName || ""));
      out.sampleCategory = defCat ? {
        name: defCat.name,
        stats: (defCat.stats || []).slice(0, 10).map(s => ({ name: s.name, displayName: s.displayName, value: s.value, perGame: s.perGameValue }))
      } : null;
    }
  } catch (e) { out.error = e.message; }
  return Response.json(out);
}
