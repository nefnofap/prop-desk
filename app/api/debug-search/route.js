// GET /api/debug-search?q=brunson — find the working search params
import { UA } from "../../../lib/espn";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "brunson");
  const tries = [
    `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10`,
    `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&mode=prefix`,
    `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=10`,
    `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&sport=basketball`,
  ];
  const out = { q, results: [] };
  for (const url of tries) {
    try {
      const r = await fetch(url, { headers: UA, cache: "no-store" });
      const entry = { url, status: r.status };
      if (r.ok) {
        const d = await r.json();
        const items = d.items || (d.results || []).flatMap(x => x.contents || []);
        entry.count = items.length;
        entry.sample = items.slice(0, 5).map(it => ({
          name: it.displayName || it.title || it.name,
          type: it.type,
          uid: it.uid,
          link: it.link?.web || it.defaultLink?.web,
        }));
      }
      out.results.push(entry);
    } catch (e) { out.results.push({ url, error: e.message }); }
  }
  return Response.json(out);
}
