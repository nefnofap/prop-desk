// GET /api/debug-search?q=brunson — see what the athlete index returns
import { ESPN_WEB, UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "brunson").toLowerCase();
  const out = { q, pages: [], totalCollected: 0 };
  for (let page = 1; page <= 8; page++) {
    try {
      const r = await fetch(`${ESPN_WEB}/athletes?limit=100&page=${page}&active=true`, { headers: UA, cache: "no-store" });
      const status = r.status;
      if (!r.ok) { out.pages.push({ page, status, error: true }); break; }
      const d = await r.json();
      const items = d.items || d.athletes || [];
      out.pages.push({ page, status, count: items.length, sampleNames: items.slice(0, 3).map(a => a.displayName || a.fullName) });
      out.totalCollected += items.length;
      if (items.length < 100) break;
    } catch (e) { out.pages.push({ page, error: e.message }); break; }
  }
  // also try a direct search endpoint
  try {
    const sr = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&sport=basketball&league=nba`, { headers: UA, cache: "no-store" });
    out.searchEndpointStatus = sr.status;
    if (sr.ok) {
      const sd = await sr.json();
      out.searchEndpointKeys = Object.keys(sd);
      out.searchSample = JSON.stringify(sd).slice(0, 500);
    }
  } catch (e) { out.searchEndpointError = e.message; }
  return Response.json(out);
}
