// NBA.com stats API — free, no key, server-side only (no CORS issue from Next.js routes)
// These headers are required; without them the API returns 403.
export const NBA_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://www.nba.com/",
  "Origin": "https://www.nba.com",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
  "Connection": "keep-alive",
};

export const CURRENT_SEASON = "2025-26";
