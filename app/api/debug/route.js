// GET /api/debug?playerId=5104157 — returns the raw shape of ESPN's gamelog
// so we can see exactly how to parse it. Wembanyama = 5104157.
import { ESPN_WEB, UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const playerId = new URL(request.url).searchParams.get("playerId") || "5104157";
  const r = await fetch(`${ESPN_WEB}/athletes/${playerId}/gamelog`, { headers: UA, cache: "no-store" });
  if (!r.ok) return Response.json({ error: `ESPN ${r.status}` });
  const d = await r.json();

  // Surface the structure without dumping the whole thing
  const summary = {
    topLevelKeys: Object.keys(d),
    names: d.names,
    labels: d.labels,
    displayNames: d.displayNames,
    seasonTypesCount: (d.seasonTypes || []).length,
    firstSeasonType: d.seasonTypes?.[0] ? {
      keys: Object.keys(d.seasonTypes[0]),
      displayName: d.seasonTypes[0].displayName,
      categoriesCount: (d.seasonTypes[0].categories || []).length,
      firstCategory: d.seasonTypes[0].categories?.[0] ? {
        keys: Object.keys(d.seasonTypes[0].categories[0]),
        eventsCount: (d.seasonTypes[0].categories[0].events || []).length,
        firstEvent: d.seasonTypes[0].categories[0].events?.[0] || null,
      } : null,
    } : null,
    eventsKeys: d.events ? Object.keys(d.events).slice(0, 3) : null,
    sampleEvent: d.events ? d.events[Object.keys(d.events)[0]] : null,
  };
  return Response.json(summary);
}
