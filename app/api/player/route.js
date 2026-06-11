// GET /api/player?q=wemban  → balldontlie player search (free API)
export const revalidate = 3600;

export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q) return Response.json({ error: "missing q" }, { status: 400 });
  const r = await fetch(
    `https://api.balldontlie.io/v1/players?search=${encodeURIComponent(q)}&per_page=10`,
    { headers: { Authorization: process.env.BALLDONTLIE_API_KEY || "" } }
  );
  if (!r.ok) return Response.json({ error: `balldontlie ${r.status} — check BALLDONTLIE_API_KEY` }, { status: 502 });
  const data = await r.json();
  return Response.json({
    players: (data.data || []).map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      team: p.team?.abbreviation || "",
      position: p.position || "",
    })),
  });
}
