// GET /api/debug-team-games?teamId=24 — inspect team's recent game results/scores
import { ESPN_BASE, UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const teamId = new URL(request.url).searchParams.get("teamId") || "24";
  // schedule endpoint carries past results with scores
  const url = `${ESPN_BASE}/teams/${teamId}/schedule`;
  const out = { tried: url };
  try {
    const r = await fetch(url, { headers: UA, cache: "no-store" });
    out.status = r.status;
    if (r.ok) {
      const d = await r.json();
      out.topKeys = Object.keys(d);
      const events = d.events || [];
      out.eventCount = events.length;
      // sample a completed game's shape
      const done = events.filter(e => e.competitions?.[0]?.status?.type?.completed);
      out.completedCount = done.length;
      const ev = done[done.length - 1];
      if (ev) {
        const comp = ev.competitions[0];
        out.sampleGame = {
          date: ev.date,
          name: ev.name || ev.shortName,
          competitors: (comp.competitors || []).map(c => ({
            abbrev: c.team?.abbreviation,
            homeAway: c.homeAway,
            score: c.score?.value ?? c.score?.displayValue ?? c.score,
            winner: c.winner,
          })),
        };
      }
    }
  } catch (e) { out.error = e.message; }
  return Response.json(out);
}
