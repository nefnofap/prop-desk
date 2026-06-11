// GET /api/games — today's NBA games via ESPN scoreboard (cloud-friendly)
import { ESPN_BASE, UA } from "../../../lib/espn";
export const revalidate = 300;

export async function GET() {
  try {
    const r = await fetch(`${ESPN_BASE}/scoreboard`, { headers: UA });
    if (!r.ok) return Response.json({ games: [] });
    const d = await r.json();
    const games = (d.events || []).map((ev) => {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      const away = comp?.competitors?.find((c) => c.homeAway === "away");
      return {
        id: ev.id,
        home: home?.team?.abbreviation || "",
        away: away?.team?.abbreviation || "",
        homeId: home?.team?.id || "",
        awayId: away?.team?.id || "",
        status: ev.status?.type?.shortDetail || "",
      };
    });
    return Response.json({ games });
  } catch {
    return Response.json({ games: [] });
  }
}
