// GET /api/player?q=wemban — search via ESPN athlete index (cloud-friendly, no key)
import { ESPN_WEB, UA } from "../../../lib/espn";
export const revalidate = 86400;

// ESPN doesn't have a clean search endpoint, so we pull the active athlete list
// (cached 24h) and filter in-memory. ~550 players, small payload.
let CACHE = null;
let CACHE_TS = 0;

async function getAthletes() {
  if (CACHE && Date.now() - CACHE_TS < 86400000) return CACHE;
  // page through active athletes
  const out = [];
  for (let page = 1; page <= 8; page++) {
    const r = await fetch(`${ESPN_WEB}/athletes?limit=100&page=${page}&active=true`, { headers: UA });
    if (!r.ok) break;
    const d = await r.json();
    const items = d.items || d.athletes || [];
    if (!items.length) break;
    for (const a of items) {
      out.push({
        id: a.id,
        name: a.displayName || a.fullName || `${a.firstName} ${a.lastName}`,
        team: a.team?.abbreviation || "",
        position: a.position?.abbreviation || "",
      });
    }
    if (items.length < 100) break;
  }
  CACHE = out; CACHE_TS = Date.now();
  return out;
}

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").toLowerCase().trim();
  if (q.length < 2) return Response.json({ error: "Type at least 2 characters" }, { status: 400 });
  try {
    const all = await getAthletes();
    const players = all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
    return Response.json({ players });
  } catch (e) {
    return Response.json({ error: `ESPN search failed: ${e.message}` }, { status: 502 });
  }
}
