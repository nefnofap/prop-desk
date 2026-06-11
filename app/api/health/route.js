// GET /api/health — diagnostics. Reports whether the key is present and what
// balldontlie says for each endpoint tier, without exposing the key itself.
export const dynamic = "force-dynamic";

export async function GET() {
  const KEY = (process.env.BALLDONTLIE_API_KEY || "").trim();
  const out = {
    keyPresent: KEY.length > 0,
    keyLength: KEY.length,
    keyLooksLikeUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(KEY),
  };
  if (!KEY) return Response.json({ ...out, verdict: "Env var empty — add BALLDONTLIE_API_KEY in Vercel settings, then REDEPLOY." });

  const check = async (url) => {
    try {
      const r = await fetch(url, { headers: { Authorization: KEY }, cache: "no-store" });
      return r.status;
    } catch { return "network-error"; }
  };

  out.teamsEndpoint = await check("https://api.balldontlie.io/v1/teams?per_page=1");
  out.playersEndpoint = await check("https://api.balldontlie.io/v1/players?per_page=1");
  out.statsEndpoint = await check("https://api.balldontlie.io/v1/stats?per_page=1&seasons[]=2025");

  out.verdict =
    out.teamsEndpoint === 401
      ? "Key rejected by balldontlie (401). The key is reaching them but is invalid — regenerate it in the balldontlie dashboard, update the Vercel env var, redeploy."
      : out.teamsEndpoint === 200 && out.statsEndpoint === 401
      ? "Key works for free endpoints but stats returns 401 — likely tier gating. Stats/game-logs may require the ALL-STAR plan on balldontlie."
      : out.teamsEndpoint === 200 && out.statsEndpoint === 403
      ? "Key valid, but the stats endpoint needs a higher balldontlie tier (403). Free tier covers teams/players/games only."
      : out.teamsEndpoint === 200 && out.statsEndpoint === 200
      ? "Everything works. If the app still errors, hard-refresh — you may be looking at a cached response."
      : `Unexpected combination — teams: ${out.teamsEndpoint}, stats: ${out.statsEndpoint}.`;

  return Response.json(out);
}
