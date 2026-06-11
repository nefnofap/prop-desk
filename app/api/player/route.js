// GET /api/player?q=wemban — balldontlie search (confirmed working, free tier)
export const revalidate = 3600;
const KEY = (process.env.BALLDONTLIE_API_KEY || "").trim();

export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.length < 2) return Response.json({ error: "Type at least 2 characters" }, { status: 400 });
  const r = await fetch(
    `https://api.balldontlie.io/v1/players?search=${encodeURIComponent(q)}&per_page=10`,
    { headers: KEY ? { Authorization: KEY } : {} }
  );
  if (!r.ok) return Response.json({ error: `Search failed (${r.status}) — BALLDONTLIE_API_KEY may be missing in Vercel` }, { status: 502 });
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
