// GET /api/logs?playerId=<espnId>&n=20 — game logs via ESPN (cloud-friendly, no key)
import { ESPN_WEB, UA } from "../../../lib/espn";
export const revalidate = 900;

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const playerId = sp.get("playerId");
  const n = Math.min(Number(sp.get("n") || 20), 50);
  if (!playerId) return Response.json({ error: "missing playerId" }, { status: 400 });

  let res;
  try {
    res = await fetch(`${ESPN_WEB}/athletes/${playerId}/gamelog`, { headers: UA });
  } catch (e) {
    return Response.json({ error: `ESPN unreachable: ${e.message}` }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: `ESPN gamelog returned ${res.status}` }, { status: 502 });
  const d = await res.json();

  // ESPN gamelog shape: seasonTypes[].categories[].events[] with labels in d.labels / d.names
  // Stat order is given by d.names (e.g. ["MIN","FG","3PT",...,"PTS","REB","AST",...]).
  const names = (d.names || d.labels || []).map((s) => String(s).toUpperCase());
  const idx = (key) => names.indexOf(key);
  const iPTS = idx("PTS"), iREB = idx("REB"), iAST = idx("AST"),
        iSTL = idx("STL"), iBLK = idx("BLK"), iTO = idx("TO"),
        i3PT = idx("3PT"), iMIN = idx("MIN");

  const parse3pm = (cell) => {
    if (cell == null) return 0;
    const s = String(cell);
    return s.includes("-") ? Number(s.split("-")[0]) || 0 : Number(s) || 0;
  };

  const logs = [];
  const events = d.events || {};
  const seasonTypes = d.seasonTypes || [];
  for (const st of seasonTypes) {
    const postseason = /post|playoff/i.test(st.displayName || "");
    for (const cat of st.categories || []) {
      for (const ev of cat.events || []) {
        const stats = ev.stats || [];
        const meta = events[ev.eventId] || {};
        logs.push({
          date: meta.gameDate || "",
          matchup: meta.opponent?.abbreviation || "",
          min: iMIN >= 0 ? stats[iMIN] : "0",
          pts: iPTS >= 0 ? Number(stats[iPTS]) || 0 : 0,
          reb: iREB >= 0 ? Number(stats[iREB]) || 0 : 0,
          ast: iAST >= 0 ? Number(stats[iAST]) || 0 : 0,
          stl: iSTL >= 0 ? Number(stats[iSTL]) || 0 : 0,
          blk: iBLK >= 0 ? Number(stats[iBLK]) || 0 : 0,
          turnover: iTO >= 0 ? Number(stats[iTO]) || 0 : 0,
          fg3m: i3PT >= 0 ? parse3pm(stats[i3PT]) : 0,
          postseason,
        });
      }
    }
  }

  // gamelog is newest-first already within each category; playoffs listed first
  const clean = logs.filter((g) => g.min && g.min !== "0" && g.min !== "--").slice(0, n);
  if (!clean.length) return Response.json({ error: "No game logs found for this player this season." }, { status: 404 });
  return Response.json({ logs: clean });
}
