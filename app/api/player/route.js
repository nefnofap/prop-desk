// GET /api/player?q=brunson — search via ESPN search/v2 (real search, NBA-filtered)
import { UA } from "../../../lib/espn";
export const revalidate = 3600;

// ESPN's working search endpoint. NBA league code in uid is "l:46".
// uid looks like "s:40~l:46~a:3934672" → athlete id 3934672.
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return Response.json({ error: "Type at least 2 characters" }, { status: 400 });

  try {
    const r = await fetch(
      `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=30`,
      { headers: UA }
    );
    if (!r.ok) return Response.json({ error: `ESPN search ${r.status}` }, { status: 502 });
    const d = await r.json();

    const contents = (d.results || []).flatMap((x) => x.contents || []);
    const players = [];
    for (const it of contents) {
      if (it.type !== "player") continue;
      const uid = it.uid || "";
      // NBA only: league code l:46
      if (!/~l:46~/.test(uid)) continue;
      const idMatch = uid.match(/a:(\d+)/);
      if (!idMatch) continue;
      players.push({
        id: idMatch[1],
        name: it.displayName || it.title || "",
        // search results don't include team/pos reliably; fill from subtitle if present
        team: (it.subtitle || "").split(/[,•·]/)[0]?.trim() || "",
        position: "",
      });
    }

    // de-dupe by id, cap at 12
    const seen = new Set();
    const unique = players.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 12);

    if (!unique.length) return Response.json({ players: [], error: "No NBA player found — try last name only." });
    return Response.json({ players: unique });
  } catch (e) {
    return Response.json({ error: `ESPN search failed: ${e.message}` }, { status: 502 });
  }
}
