# Prop Desk

NBA player-prop analysis with **real math, no LLM guesses**:

- Empirical hit rates computed from the player's actual recent game logs ([balldontlie](https://www.balldontlie.io) free API)
- Bayesian shrinkage toward 50% so small samples don't earn big claims
- All stat types: PTS, REB, AST, STL, BLK, 3PM, TO, PRA, PR, PA, RA
- Edge vs your book's odds, ¼-Kelly sizing (3% cap per leg)
- Parlays up to **10 legs** with auto-recommended tiers (Safest / Balanced / Aggressive / Lottery), same-team correlation haircut, and honest "over 100 plays" expectations

## Deploy (free)

1. **Get a free API key** at [balldontlie.io](https://www.balldontlie.io) (sign up → dashboard → copy key).
2. **Push this repo to GitHub** (already done if you're reading this there).
3. **Vercel**: [vercel.com/new](https://vercel.com/new) → Import this repo → add environment variable
   `BALLDONTLIE_API_KEY` = your key → Deploy. Done — Vercel auto-detects Next.js.
4. Every `git push` to `main` auto-redeploys.

## Local dev

```bash
npm install
cp .env.example .env.local   # add your key
npm run dev                  # http://localhost:3000
```

## How the probability works

For a prop like "Wembanyama Over 9.5 Rebounds":

1. Fetch his last N games (you choose the window, 5–20; playoff games included and sorted newest first)
2. Count hits, weight the last 5 games double
3. Shrink toward 0.5 with 8 pseudo-observations: `p = (weighted_hits + 4) / (weighted_n + 8)`
   — a 10/10 streak becomes ~78%, not 100%, because books set lines at medians and
   small-sample streaks are mostly line placement, not edge
4. Edge = p − break-even probability implied by your odds (e.g. −110 → 52.4%)

Parlay hit probability multiplies leg probabilities, then applies a 10%-per-extra-same-team-leg
haircut for correlation. This is a conservative heuristic, clearly labeled — not a fitted copula.

## Honest limitations

- No injury/lineup awareness — check reports yourself before betting
- Empirical hit rates ≠ true probabilities; edges under ~3% are noise
- balldontlie free tier is rate-limited; responses are cached 15 min server-side
- Optional upgrade: add [The Odds API](https://the-odds-api.com) (free 500 credits/mo) to pull
  live prop lines instead of typing them — see `app/api/` for the pattern to follow

**Bet only what survives being wrong.**
