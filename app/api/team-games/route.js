// GET /api/team-games?teamId=24&n=15 — recent completed games with scores
import { ESPN_BASE, UA } from "../../../lib/espn";
export const revalidate = 1800;

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const teamId = sp.get("teamId");
  const n = Math.min(Number(sp.get("n") || 15), 30);
  if (!teamId) return Response.json({ error: "missing teamId" }, { status: 400 });

  try {
    const r = await fetch(`${ESPN_BASE}/teams/${teamId}/schedule`, { headers: UA });
    if (!r.ok) return Response.json({ error: `ESPN schedule ${r.status}` }, { status: 502 });
    const d = await r.json();
    const events = d.events || [];

    const games = [];
    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!comp?.status?.type?.completed) continue;
      const me = comp.competitors.find(c => c.team?.id === String(teamId));
      const opp = comp.competitors.find(c => c.team?.id !== String(teamId));
      if (!me || !opp) continue;
      const myScore = Number(me.score?.value ?? me.score);
      const oppScore = Number(opp.score?.value ?? opp.score);
      if (isNaN(myScore) || isNaN(oppScore)) continue;
      games.push({
        date: ev.date,
        opp: opp.team?.abbreviation || "",
        home: me.homeAway === "home",
        myScore, oppScore,
        margin: myScore - oppScore,
        total: myScore + oppScore,
        won: myScore > oppScore,
      });
    }
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = games.slice(0, n);
    if (!recent.length) return Response.json({ error: "No completed games found." }, { status: 404 });

    const teamName = d.team?.abbreviation || d.team?.displayName || "";
    return Response.json({ team: teamName, games: recent });
  } catch (e) {
    return Response.json({ error: `team-games failed: ${e.message}` }, { status: 502 });
  }
}
