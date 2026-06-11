"use client";
import { useState, useMemo, useEffect } from "react";
import {
  STAT_TYPES, impliedProb, weightedShrunkProb, kellyStake,
  priceParlay, recommendParlays, autoSuggest, evalLine,
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
    <span style={{
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
  const [window_, setWindow] = useState(10);
  const [games, setGames] = useState([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [stake, setStake] = useState(100);
  const [showHelp, setShowHelp] = useState(false);

  const [bookStat, setBookStat] = useState("pts");
  const [bookLine, setBookLine] = useState("");

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
      setDraft({ player: p, logs: d.logs, odds: defaultOdds });
      setBookStat("pts"); setBookLine("");
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

  const addLeg = (stat, line, side, odds) => {
    if (slate.length >= 10) return;
    setSlate(prev => [...prev, {
      player: draft.player, logs: draft.logs, stat, line, side,
      odds: odds || draft.odds, window: window_, team: draft.player.team, id: Date.now(),
    }]);
    setSlipOpen(true);
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

  const suggestions = useMemo(() => draft ? autoSuggest(draft.logs, window_, draft.odds).slice(0, 6) : [], [draft, window_]);

  const bookEval = useMemo(() => {
    if (!draft || bookLine === "" || isNaN(Number(bookLine))) return null;
    return evalLine(draft.logs, window_, bookStat, Number(bookLine), draft.odds);
  }, [draft, bookStat, bookLine, window_]);

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
          <label style={lbl}>Payout odds per leg
            <input type="number" step="0.01" value={defaultOdds} onChange={e => setDefaultOdds(Number(e.target.value) || 1.91)} style={{ ...inp, width: 80 }} />
          </label>
          <button onClick={() => setShowHelp(!showHelp)} style={{ ...btnGhost, fontSize: 11 }}>
            {showHelp ? "Hide guide" : "❓ How to use this"}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 14px" }}>

        {showHelp && (
          <section style={{ ...panel, marginTop: 14 }}>
            <div style={sectionTitle}>How to actually win with this</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--tx)" }}>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>1. Open 747 first.</b> Look at the prop they offer — e.g. "Wembanyama Points, line 35."</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>2. Type THAT line here</b> in the "Check 747's line" box. The app shows how often he actually hit over/under <i>that exact number</i>. The line must match 747's or the % means nothing.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>3. Look for a gap.</b> 747 set 35 but he went over only 2 of 10? The UNDER is the value.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Games slider</b> sets how many recent games to use — fewer (5) = hot/cold form, more (20) = stable average.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Parlay = ALL legs must win.</b> Miss one, lose everything. 5 legs at 70% each = only 17% the whole thing hits.</p>
              <p style={{ color: "var(--red)" }}>A screening tool, not a guarantee. 747's "soft" line may reflect news you don't see. Bet only what you can lose.</p>
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
          <div style={sectionTitle}>Search player (add as many as you want)</div>
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

        {draft && (
          <section style={{ ...panel, border: "1px solid rgba(251,191,36,.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 20, fontFamily: "Oswald,sans-serif" }}>{draft.player.name}</div>
                <div style={{ color: "var(--mut)", fontSize: 12 }}>{draft.player.team} · {draft.player.position}</div>
              </div>
              <button onClick={() => setDraft(null)} style={{ ...btnGhost, padding: "4px 8px" }}>✕</button>
            </div>

            {/* Games slider — restored, controls every calculation on this card */}
            <label style={lbl}>Use last {window_} games {window_ <= 6 ? "(recent form)" : window_ >= 16 ? "(season-long)" : ""}
              <input type="range" min="5" max="20" value={window_}
                onChange={e => setWindow(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--amber)" }} />
            </label>

            {/* ★ 747 LINE CHECK */}
            <div style={{ background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.4)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)", fontFamily: "Oswald,sans-serif", letterSpacing: "0.05em" }}>★ CHECK 747'S LINE</div>
              <div style={{ fontSize: 11, color: "var(--mut)" }}>Type the exact stat & line 747 is offering. See how often it actually hit.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={bookStat} onChange={e => setBookStat(e.target.value)} style={{ ...inp, flex: 1 }}>
                  {Object.entries(STAT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="number" step="0.5" value={bookLine} placeholder="747's line, e.g. 35"
                  onChange={e => setBookLine(e.target.value)} style={{ ...inp, flex: 1 }} />
              </div>

              {bookEval && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ ...sideBox, borderColor: bookEval.over > bookEval.under ? "var(--green)" : "var(--line)" }}>
                      <div style={miniLbl}>OVER {bookEval.line}</div>
                      <div style={{ ...miniVal, fontSize: 22, color: bookEval.over >= 0.6 ? "var(--green)" : bookEval.over <= 0.4 ? "var(--red)" : "var(--amber)" }}>{fmtPct(bookEval.over)}</div>
                      <div style={{ fontSize: 10, color: "var(--mut)" }}>hit {bookEval.overHits}/{bookEval.n} games</div>
                      <button onClick={() => addLeg(bookStat, bookEval.line, "over", draft.odds)} disabled={slate.length >= 10}
                        style={{ ...btnGhost, fontSize: 11, padding: "5px 8px", marginTop: 6, width: "100%" }}>+ Add Over</button>
                    </div>
                    <div style={{ ...sideBox, borderColor: bookEval.under > bookEval.over ? "var(--green)" : "var(--line)" }}>
                      <div style={miniLbl}>UNDER {bookEval.line}</div>
                      <div style={{ ...miniVal, fontSize: 22, color: bookEval.under >= 0.6 ? "var(--green)" : bookEval.under <= 0.4 ? "var(--red)" : "var(--amber)" }}>{fmtPct(bookEval.under)}</div>
                      <div style={{ fontSize: 10, color: "var(--mut)" }}>hit {bookEval.underHits}/{bookEval.n} games</div>
                      <button onClick={() => addLeg(bookStat, bookEval.line, "under", draft.odds)} disabled={slate.length >= 10}
                        style={{ ...btnGhost, fontSize: 11, padding: "5px 8px", marginTop: 6, width: "100%" }}>+ Add Under</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tx)", textAlign: "center", padding: "6px", background: "rgba(0,0,0,.25)", borderRadius: 6 }}>
                    Lean: <b style={{ color: verdict(bookEval.edge).color }}>{bookEval.best.toUpperCase()} {bookEval.line}</b> ({fmtPct(bookEval.bestProb)}) — {verdict(bookEval.edge).text}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>
                    Recent {STAT_TYPES[bookStat].label}: avg {bookEval.avg.toFixed(1)}, range {bookEval.min}–{bookEval.max} over {bookEval.n} games.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {bookEval.vals.map((v, i) => <Chip key={i} val={v} hit={bookEval.best === "over" ? v > bookEval.line : v < bookEval.line} />)}
                  </div>
                </div>
              )}
            </div>

            {/* Best bets */}
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)", marginBottom: 4, fontFamily: "'IBM Plex Mono',monospace" }}>
                Or explore: his strongest stats (app picks the line)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map(s => {
                  const v = verdict(s.edge);
                  const sideLabel = s.side === "over" ? "Over" : "Under";
                  return (
                    <div key={s.key}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                      <div>
                        <div style={{ fontSize: 14, color: "var(--tx)", fontWeight: 600 }}>
                          {s.label} — <span style={{ color: s.side === "over" ? "var(--green)" : "var(--amber)" }}>{sideLabel} {s.line}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--mut)", fontFamily: "'IBM Plex Mono',monospace" }}>
                          {sideLabel === "Over" ? "went over" : "stayed under"} {s.hits}/{s.n} · avg {s.avg.toFixed(1)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: v.color, fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(s.p)}</div>
                          <div style={{ fontSize: 9, color: v.color }}>{v.text}</div>
                        </div>
                        <button onClick={() => addLeg(s.key, s.line, s.side, draft.odds)} disabled={slate.length >= 10}
                          style={{ ...btnGhost, padding: "6px 10px", fontSize: 16 }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {legs.length > 0 && (
          <section style={panel}>
            <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between" }}>
              <span>My Parlay — {legs.length}/10 legs</span>
              <button onClick={() => setSlate([])} style={{ ...btnGhost, fontSize: 11, padding: "2px 8px" }}>Clear all</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>⚠ ALL {legs.length} legs must win or the whole parlay loses.</div>
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
            <div style={{ fontSize: 11, color: "var(--mut)", marginTop: -4 }}>Built only from your positive-edge legs. ALL legs must win to pay out — more legs = bigger payout but much lower chance.</div>
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
                    {[["Chance ALL hit", fmtPct(adjP)], ["Payout", `${dec.toFixed(2)}x`], [`Bet ${fmtCash(stake, sym)} →`, fmtCash(stake * dec, sym)]].map(([k, v]) => (
                      <div key={k} style={miniStat}><div style={miniLbl}>{k}</div><div style={miniVal}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>
                    Bet {fmtCash(stake, sym)} 100 times: win ~{Math.round(adjP * 100)}, lose ~{100 - Math.round(adjP * 100)} → net {fmtCash((adjP * (dec - 1) - (1 - adjP)) * 100 * stake, sym)}.
                    {extraSameTeam > 0 && " (Same-team legs adjusted down — they tend to move together.)"}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {legs.length >= 2 && parlays.length === 0 && (
          <div style={{ ...panel, color: "var(--mut)", fontSize: 13 }}>
            No parlay worth recommending — fewer than 2 of your legs beat the odds. That's the app protecting you.
          </div>
        )}

        <footer style={{ fontSize: 11, color: "var(--mut)", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
          Numbers come from real ESPN game logs. They estimate, they don't predict. Match the app's line to 747's line or the % means nothing. Bet only what you can afford to lose.
        </footer>
      </div>

      {legs.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1117", borderTop: "2px solid var(--amber)", zIndex: 100 }}>
          <button onClick={() => setSlipOpen(!slipOpen)}
            style={{ width: "100%", background: "transparent", border: "none", color: "var(--amber)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "Oswald,sans-serif", fontSize: 15 }}>
            <span>🎰 MY PARLAY — {legs.length} legs</span>
            {slip && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>{slip.dec.toFixed(2)}x · {fmtPct(slip.adjP)}</span>}
            <span>{slipOpen ? "▼" : "▲"}</span>
          </button>
          {slipOpen && slip && (
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>⚠ ALL {legs.length} legs must win.</div>
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
                Chance all {legs.length} hit: <b style={{ color: slip.adjP > 0.3 ? "var(--green)" : "var(--amber)" }}>{fmtPct(slip.adjP)}</b> · {slip.ev >= 0 ? "good value ✓" : "odds against this ✗"}
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
const sideBox = { background: "rgba(0,0,0,.3)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 };
const miniStat = { background: "rgba(0,0,0,.3)", borderRadius: 6, padding: "8px 10px", textAlign: "center" };
const miniLbl = { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mut)" };
const miniVal = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: "var(--tx)", marginTop: 2 };
