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

  // Stats array is indexed by d.labels: ["MIN","FG","FG%","3PT","3P%","FT","FT%","REB","AST","BLK","STL","PF","TO","PTS"]
  const labels = (d.labels || []).map((s) => String(s).toUpperCase());
  const ix = (key) => labels.indexOf(key);
  const iMIN = ix("MIN"), i3PT = ix("3PT"), iREB = ix("REB"), iAST = ix("AST"),
        iBLK = ix("BLK"), iSTL = ix("STL"), iTO = ix("TO"), iPTS = ix("PTS");

  // "9-25" style cell → made (first number)
  const made = (cell) => {
    if (cell == null) return 0;
    const s = String(cell);
    return s.includes("-") ? Number(s.split("-")[0]) || 0 : Number(s) || 0;
  };

  const eventsMeta = d.events || {};
  const logs = [];

  for (const st of d.seasonTypes || []) {
    const postseason = /post|playoff/i.test(st.displayName || "");
    for (const cat of st.categories || []) {
      for (const ev of cat.events || []) {
        const s = ev.stats || [];
        if (!s.length) continue;
        const meta = eventsMeta[ev.eventId] || {};
        logs.push({
          date: meta.gameDate || "",
          matchup: `${meta.atVs || ""}${meta.opponent?.abbreviation || ""}`,
          min: iMIN >= 0 ? s[iMIN] : "0",
          pts: iPTS >= 0 ? Number(s[iPTS]) || 0 : 0,
          reb: iREB >= 0 ? Number(s[iREB]) || 0 : 0,
          ast: iAST >= 0 ? Number(s[iAST]) || 0 : 0,
          stl: iSTL >= 0 ? Number(s[iSTL]) || 0 : 0,
          blk: iBLK >= 0 ? Number(s[iBLK]) || 0 : 0,
          turnover: iTO >= 0 ? Number(s[iTO]) || 0 : 0,
          fg3m: i3PT >= 0 ? made(s[i3PT]) : 0,
          postseason,
          ts: meta.gameDate ? new Date(meta.gameDate).getTime() : 0,
        });
      }
    }
  }

  // Sort newest-first across all season types, then take n
  logs.sort((a, b) => b.ts - a.ts);
  const clean = logs
    .filter((g) => g.min && g.min !== "0" && g.min !== "--" && g.min !== "0:00")
    .slice(0, n)
    .map(({ ts, ...rest }) => rest);

  if (!clean.length) return Response.json({ error: "No game logs found for this player this season." }, { status: 404 });
  return Response.json({ logs: clean });
}
