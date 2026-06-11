// GET /api/roster?teamId=<espnTeamId> — roster via ESPN (cloud-friendly)
import { ESPN_BASE, UA } from "../../../lib/espn";
export const revalidate = 3600;

export async function GET(request) {
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) return Response.json({ error: "missing teamId" }, { status: 400 });
  try {
    const r = await fetch(`${ESPN_BASE}/teams/${teamId}/roster`, { headers: UA });
    if (!r.ok) return Response.json({ error: `ESPN roster ${r.status}` }, { status: 502 });
    const d = await r.json();
    const players = (d.athletes || []).map((a) => ({
      id: a.id,
      name: a.displayName || a.fullName,
      position: a.position?.abbreviation || "",
    }));
    return Response.json({ players });
  } catch (e) {
    return Response.json({ error: `ESPN roster failed: ${e.message}` }, { status: 502 });
  }
}
