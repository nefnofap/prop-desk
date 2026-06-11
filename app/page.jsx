"use client";
import { useState, useMemo, useEffect } from "react";
import {
  STAT_TYPES, impliedProb, weightedShrunkProb, kellyStake,
  priceParlay, recommendParlays, autoSuggest, decimalToAmerican,
} from "../lib/engine";

const fmtPct = (x, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const fmtCash = (x, sym) => `${sym}${Math.abs(x).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

function SegBar({ p, segs = 20 }) {
  const lit = Math.round(p * segs);
  const col = p >= 0.56 ? "var(--green)" : p <= 0.44 ? "var(--red)" : "var(--amber)";
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 14, borderRadius: 2, background: i < lit ? col : "#1a212c", transition: "background .25s" }} />
      ))}
    </div>
  );
}

function Chip({ val, hit }) {
  return (
    <span title={hit ? "Hit the line this game" : "Missed the line this game"} style={{
      fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: "2px 6px", borderRadius: 4,
      border: `1px solid ${hit ? "rgba(52,211,153,.4)" : "rgba(248,113,113,.3)"}`,
      color: hit ? "var(--green)" : "var(--red)",
      background: hit ? "rgba(52,211,153,.07)" : "rgba(248,113,113,.07)",
    }}>{val}</span>
  );
}

function verdict(edge) {
  if (edge > 0.05) return { text: "STRONG", color: "var(--green)" };
  if (edge > 0.02) return { text: "GOOD", color: "var(--green)" };
  if (edge > 0) return { text: "SLIGHT EDGE", color: "var(--amber)" };
  if (edge > -0.03) return { text: "NO EDGE", color: "var(--mut)" };
  return { text: "AVOID", color: "var(--red)" };
}

export default function PropDesk() {
  const [bankroll, setBankroll] = useState(5000);
  const [sym, setSym] = useState("₱");
  const [defaultOdds, setDefaultOdds] = useState(1.91);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [slate, setSlate] = useState([]);
  const [draft, setDraft] = useState(null);
  const [games, setGames] = useState([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [stake, setStake] = useState(100);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    fetch("/api/games").then(r => r.json()).then(d => setGames(d.games || [])).catch(() => {});
  }, []);

  const search = async (q) => {
    const sq = (q || query).trim();
    if (!sq) return;
    setBusy(true); setError(null); setPlayers([]);
    try {
      const r = await fetch(`/api/player?q=${encodeURIComponent(sq)}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.players.length) throw new Error("No players found — try a different spelling.");
      setPlayers(d.players);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const pickPlayer = async (p) => {
    setBusy(true); setError(null); setPlayers([]);
    try {
      const r = await fetch(`/api/logs?playerId=${encodeURIComponent(p.id)}&n=20`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDraft({ player: p, logs: d.logs, stat: "pts", line: 20.5, side: "over", odds: defaultOdds, window: 10 });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const loadRoster = async (teamId, teamCode) => {
    setBusy(true); setError(null); setPlayers([]);
    try {
      const r = await fetch(`/api/roster?teamId=${teamId}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPlayers(d.players.map(p => ({ ...p, team: teamCode })));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const addToSlip = (leg) => {
    if (slate.length >= 10) return;
    setSlate(prev => [...prev, { ...leg, id: Date.now() }]);
    setDraft(null); setQuery(""); setSlipOpen(true);
  };

  const removeLeg = (id) => setSlate(prev => prev.filter(l => l.id !== id));

  const legs = useMemo(() => slate.map((pr) => {
    const vals = pr.logs.slice(0, pr.window).map(STAT_TYPES[pr.stat].calc);
    const { p, hits, n } = weightedShrunkProb(vals, pr.line, pr.side);
    const edge = p - impliedProb(pr.odds);
    return { ...pr, p, hits, n, edge, vals };
  }), [slate]);

  const parlays = useMemo(() => recommendParlays(legs), [legs]);
  const slip = useMemo(() => legs.length >= 2 ? priceParlay(legs) : null, [legs]);

  const draftVals = draft ? draft.logs.slice(0, draft.window).map(STAT_TYPES[draft.stat].calc) : [];
  const draftProb = draft ? weightedShrunkProb(draftVals, draft.line, draft.side) : null;
  const draftEdge = draft && draftProb ? draftProb.p - impliedProb(draft.odds) : 0;
  const draftKelly = draft && draftProb ? kellyStake(draftProb.p, draft.odds, bankroll) : 0;
  const draftAvg = draftVals.length ? (draftVals.reduce((a, b) => a + b, 0) / draftVals.length) : 0;
  const suggestions = useMemo(() => draft ? autoSuggest(draft.logs, draft.window, draft.odds).slice(0, 6) : [], [draft]);
  const dv = draft ? verdict(draftEdge) : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--tx)", fontFamily: "Inter,sans-serif", paddingBottom: 120 }}>

      <header style={{ borderBottom: "1px solid var(--line)", padding: "14px 16px 12px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase" }}>Risk Desk · 747 Parlay Builder</div>
        <h1 style={{ fontFamily: "Oswald,sans-serif", fontSize: 28, margin: "2px 0 0" }}>PROP DESK</h1>
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={lbl}>Bankroll
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select value={sym} onChange={e => setSym(e.target.value)} style={{ ...inp, width: 60 }}>
                <option value="₱">₱ PHP</option>
                <option value="$">$ USD</option>
              </select>
              <input type="number" value={bankroll} onChange={e => setBankroll(Number(e.target.value) || 0)} style={{ ...inp, width: 100 }} />
            </div>
          </label>
          <label style={lbl}>My payout odds
            <input type="number" step="0.01" value={defaultOdds} onChange={e => setDefaultOdds(Number(e.target.value) || 1.91)} style={{ ...inp, width: 80 }} />
          </label>
          <button onClick={() => setShowHelp(!showHelp)} style={{ ...btnGhost, fontSize: 11 }}>
            {showHelp ? "Hide guide" : "❓ How to read this"}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 14px" }}>

        {showHelp && (
          <section style={{ ...panel, marginTop: 14 }}>
            <div style={sectionTitle}>How to read this</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--tx)" }}>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>The line</b> is the number you bet over or under. "Over 25.5 points" means he needs 26+. "Under" means he stays below it.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Odds (1.91)</b> is your payout multiplier. Bet {sym}100 at 1.91 → get {sym}191 back if it wins ({sym}91 profit). It also sets your <b>break-even</b>: at 1.91 you must win 52% of the time just to not lose money.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Hit %</b> is how often we estimate the bet wins (over OR under), based on his real recent games.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Edge</b> = Hit % minus break-even. If it hits 56% but you only need 52%, that's +4% edge in your favor. <span style={{ color: "var(--green)" }}>Green = good bet</span>, <span style={{ color: "var(--mut)" }}>grey = skip it</span>.</p>
              <p><b style={{ color: "var(--amber)" }}>Best bets</b> automatically picks whichever side — over or under — has the better chance for each stat.</p>
            </div>
          </section>
        )}

        {games.length > 0 && (
          <section style={panel}>
            <div style={sectionTitle}>Today's Games — tap a team to see its players</div>
            {games.map(g => (
              <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                <button style={teamBtn} onClick={() => loadRoster(g.awayId, g.away)}>{g.away}</button>
                <span style={{ color: "var(--mut)", fontSize: 12 }}>@</span>
                <button style={teamBtn} onClick={() => loadRoster(g.homeId, g.home)}>{g.home}</button>
                <span style={{ color: "var(--mut)", fontSize: 11, marginLeft: "auto" }}>{g.status}</span>
              </div>
            ))}
          </section>
        )}

        <section style={panel}>
          <div style={sectionTitle}>Search player</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={query} placeholder="e.g. Wembanyama, Brunson"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              style={{ ...inp, flex: 1 }} />
            <button onClick={() => search()} disabled={busy} style={btnPrimary}>
              {busy ? "…" : "Search"}
            </button>
          </div>
          {players.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {players.map(p => (
                <button key={p.id} onClick={() => pickPlayer(p)} style={{ ...btnGhost, textAlign: "left" }}>
                  {p.name} <span style={{ color: "var(--mut)", fontSize: 11 }}>{p.team} {p.position}</span>
                </button>
              ))}
            </div>
          )}
          {error && <div style={errStyle}>{error}</div>}
        </section>

        {draft && draftProb && (
          <section style={{ ...panel, border: "1px solid rgba(251,191,36,.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 20, fontFamily: "Oswald,sans-serif" }}>{draft.player.name}</div>
                <div style={{ color: "var(--mut)", fontSize: 12 }}>{draft.player.team} · {draft.player.position} · last {draft.window} games</div>
              </div>
              <button onClick={() => setDraft(null)} style={{ ...btnGhost, padding: "4px 8px" }}>✕</button>
            </div>

            {/* BEST BETS as readable cards — picks the stronger side (over/under) */}
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--amber)", marginBottom: 8, fontFamily: "'IBM Plex Mono',monospace" }}>
                Best bets right now (at odds {draft.odds})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map(s => {
                  const v = verdict(s.edge);
                  const selected = draft.stat === s.key && draft.line === s.line && draft.side === s.side;
                  const sideLabel = s.side === "over" ? "Over" : "Under";
                  return (
                    <button key={s.key} onClick={() => setDraft({ ...draft, stat: s.key, line: s.line, side: s.side })}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        background: selected ? "rgba(251,191,36,.1)" : "rgba(0,0,0,.25)",
                        border: `1px solid ${selected ? "var(--amber)" : "var(--line)"}`,
                        borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left", width: "100%",
                      }}>
                      <div>
                        <div style={{ fontSize: 14, color: "var(--tx)", fontWeight: 600 }}>
                          {s.label} — <span style={{ color: s.side === "over" ? "var(--green)" : "var(--amber)" }}>{sideLabel} {s.line}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--mut)", fontFamily: "'IBM Plex Mono',monospace" }}>
                          {sideLabel === "Over" ? "went over in" : "stayed under in"} {s.hits} of last {s.n} · avg {s.avg.toFixed(1)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: v.color, fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(s.p)}</div>
                        <div style={{ fontSize: 10, color: v.color, letterSpacing: "0.05em" }}>{v.text}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)", marginBottom: 8, fontFamily: "'IBM Plex Mono',monospace" }}>Or build it yourself</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                <label style={lbl}>Stat
                  <select value={draft.stat} onChange={e => setDraft({ ...draft, stat: e.target.value })} style={inp}>
                    {Object.entries(STAT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label style={lbl}>Line (the number)
                  <input type="number" step="0.5" value={draft.line} onChange={e => setDraft({ ...draft, line: Number(e.target.value) })} style={inp} />
                </label>
                <label style={lbl}>Over or Under
                  <select value={draft.side} onChange={e => setDraft({ ...draft, side: e.target.value })} style={inp}>
                    <option value="over">Over</option>
                    <option value="under">Under</option>
                  </select>
                </label>
                <label style={lbl}>My payout odds
                  <input type="number" step="0.01" value={draft.odds} onChange={e => setDraft({ ...draft, odds: Number(e.target.value) || 1.91 })} style={inp} />
                </label>
              </div>
              <label style={{ ...lbl, marginTop: 10 }}>How many recent games to use: {draft.window}
                <input type="range" min="5" max="20" value={draft.window}
                  onChange={e => setDraft({ ...draft, window: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--amber)" }} />
              </label>
            </div>

            {/* Game-by-game chips with label */}
            <div>
              <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 5 }}>
                Each box = one game ({STAT_TYPES[draft.stat].label}). <span style={{ color: "var(--green)" }}>Green</span> = bet would win, <span style={{ color: "var(--red)" }}>red</span> = would lose. Newest first.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {draftVals.map((v, i) => <Chip key={i} val={v} hit={draft.side === "over" ? v > draft.line : v < draft.line} />)}
              </div>
            </div>

            {/* THE VERDICT — big and clear */}
            <div style={{ background: "rgba(0,0,0,.3)", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {STAT_TYPES[draft.stat].label} {draft.side === "over" ? "Over" : "Under"} {draft.line}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: dv.color, fontFamily: "'IBM Plex Mono',monospace" }}>{dv.text}</span>
              </div>
              <SegBar p={draftProb.p} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                <div style={miniStat}><div style={miniLbl}>Chance it hits</div><div style={{ ...miniVal, color: dv.color }}>{fmtPct(draftProb.p)}</div></div>
                <div style={miniStat}><div style={miniLbl}>You need (break-even)</div><div style={miniVal}>{fmtPct(impliedProb(draft.odds))}</div></div>
                <div style={miniStat}><div style={miniLbl}>Your edge</div><div style={{ ...miniVal, color: draftEdge >= 0 ? "var(--green)" : "var(--red)" }}>{draftEdge >= 0 ? "+" : ""}{fmtPct(draftEdge)}</div></div>
                <div style={miniStat}><div style={miniLbl}>Suggested stake</div><div style={{ ...miniVal, color: "var(--amber)" }}>{fmtCash(draftKelly, sym)}</div></div>
              </div>
              <div style={{ fontSize: 11, color: "var(--mut)" }}>
                {draft.side === "over" ? "Went over" : "Stayed under"} {draftProb.hits} of last {draftProb.n} games · averaging {draftAvg.toFixed(1)} {STAT_TYPES[draft.stat].short}.
              </div>
            </div>

            <button
              onClick={() => addToSlip({ player: draft.player, logs: draft.logs, stat: draft.stat, line: draft.line, side: draft.side, odds: draft.odds, window: draft.window, team: draft.player.team })}
              disabled={slate.length >= 10}
              style={{ ...btnPrimary, width: "100%" }}>
              {slate.length >= 10 ? "10-leg limit" : `+ Add to Parlay Slip (${slate.length}/10)`}
            </button>
          </section>
        )}

        {legs.length > 0 && (
          <section style={panel}>
            <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between" }}>
              <span>My Slip — {legs.length}/10 legs</span>
              <button onClick={() => setSlate([])} style={{ ...btnGhost, fontSize: 11, padding: "2px 8px" }}>Clear all</button>
            </div>
            {legs.map(l => {
              const v = verdict(l.edge);
              return (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.player.name} — {STAT_TYPES[l.stat].label} {l.side === "over" ? "Over" : "Under"} {l.line}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--mut)" }}>
                      {fmtPct(l.p)} chance · odds {l.odds} · <span style={{ color: v.color }}>{v.text}</span>
                    </div>
                  </div>
                  <button onClick={() => removeLeg(l.id)} style={{ ...btnGhost, padding: "4px 8px", color: "var(--red)" }}>✕</button>
                </div>
              );
            })}
          </section>
        )}

        {parlays.length > 0 && (
          <section style={panel}>
            <div style={sectionTitle}>Recommended Parlays</div>
            <div style={{ fontSize: 11, color: "var(--mut)", marginTop: -4 }}>A parlay combines bets for a bigger payout, but ALL must hit to win. More legs = bigger payout, smaller chance.</div>
            {parlays.map(pl => {
              const { dec, adjP, ev, extraSameTeam } = priceParlay(pl.legs);
              return (
                <div key={pl.name} style={{ ...card, borderColor: ev >= 0 ? "rgba(52,211,153,.3)" : "var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 16, color: "var(--amber)" }}>{pl.emoji} {pl.name} — {pl.legs.length} legs</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: ev >= 0 ? "var(--green)" : "var(--red)" }}>{ev >= 0 ? "+EV ✓" : "−EV ✗"}</span>
                  </div>
                  {pl.legs.map((l, i) => (
                    <div key={i} style={{ fontSize: 12, color: "var(--tx)" }}>
                      • {l.player.name} {STAT_TYPES[l.stat].label} {l.side === "over" ? "O" : "U"}{l.line} <span style={{ color: "var(--mut)" }}>({fmtPct(l.p)})</span>
                    </div>
                  ))}
                  <SegBar p={adjP} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    {[["Chance all hit", fmtPct(adjP)], ["Payout multiplier", `${dec.toFixed(2)}x`], [`If you bet ${fmtCash(stake, sym)}`, fmtCash(stake * dec, sym)]].map(([k, v]) => (
                      <div key={k} style={miniStat}><div style={miniLbl}>{k}</div><div style={miniVal}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>
                    Bet this {fmtCash(stake, sym)} 100 times: win ~{Math.round(adjP * 100)}, lose ~{100 - Math.round(adjP * 100)} → net {fmtCash((adjP * (dec - 1) - (1 - adjP)) * 100 * stake, sym)}.
                    {extraSameTeam > 0 && " (Same-team legs adjusted down — they tend to win or lose together.)"}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {legs.length >= 2 && parlays.length === 0 && (
          <div style={{ ...panel, color: "var(--mut)", fontSize: 13 }}>
            No parlay worth recommending — fewer than 2 of your legs beat the odds. That's the app protecting you, not a bug.
          </div>
        )}

        <footer style={{ fontSize: 11, color: "var(--mut)", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
          Numbers come from real ESPN game logs. They estimate, they don't predict — a player can always have an off night. Bet only what you can afford to lose.
        </footer>
      </div>

      {legs.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1117", borderTop: "2px solid var(--amber)", zIndex: 100 }}>
          <button onClick={() => setSlipOpen(!slipOpen)}
            style={{ width: "100%", background: "transparent", border: "none", color: "var(--amber)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "Oswald,sans-serif", fontSize: 15 }}>
            <span>🎰 MY SLIP — {legs.length} legs</span>
            {slip && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>{slip.dec.toFixed(2)}x · {fmtPct(slip.adjP)} chance</span>}
            <span>{slipOpen ? "▼" : "▲"}</span>
          </button>
          {slipOpen && slip && (
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {legs.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{l.player.name} {STAT_TYPES[l.stat].short} {l.side === "over" ? "O" : "U"}{l.line}</span>
                  <span style={{ color: l.edge >= 0 ? "var(--green)" : "var(--red)", fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(l.p)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <label style={{ ...lbl, flex: 1 }}>Bet amount ({sym})
                  <input type="number" value={stake} onChange={e => setStake(Number(e.target.value) || 0)} style={inp} />
                </label>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" }}>If all hit, you win</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, color: "var(--amber)" }}>{fmtCash(stake * slip.dec, sym)}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--mut)" }}>
                Chance all {legs.length} hit: <b style={{ color: slip.adjP > 0.3 ? "var(--green)" : "var(--amber)" }}>{fmtPct(slip.adjP)}</b> · {slip.ev >= 0 ? "good value ✓" : "the odds are against this ✗"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inp = { background: "#0c1118", border: "1px solid var(--line)", borderRadius: 6, color: "var(--tx)", padding: "8px 10px", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", width: "100%", boxSizing: "border-box" };
const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" };
const btnPrimary = { background: "var(--amber)", color: "#0a0e14", border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Oswald,sans-serif", letterSpacing: "0.05em" };
const btnGhost = { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, color: "var(--amber)", padding: "8px 12px", fontSize: 12, cursor: "pointer" };
const panel = { background: "#11161f", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 };
const card = { background: "rgba(0,0,0,.2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const sectionTitle = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" };
const teamBtn = { ...btnGhost, padding: "6px 12px", fontSize: 13, fontFamily: "Oswald,sans-serif", fontWeight: 600 };
const errStyle = { color: "var(--red)", fontSize: 12, background: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 6, padding: "8px 12px" };
const miniStat = { background: "rgba(0,0,0,.3)", borderRadius: 6, padding: "8px 10px", textAlign: "center" };
const miniLbl = { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mut)" };
const miniVal = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: "var(--tx)", marginTop: 2 };
