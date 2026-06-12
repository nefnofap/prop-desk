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

  // scanner
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [scanLabel, setScanLabel] = useState("");

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
    setBusy(true); setError(null); setPlayers([]); setQuery("");
    try {
      const r = await fetch(`/api/logs?playerId=${encodeURIComponent(p.id)}&n=20`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDraft({ player: p, logs: d.logs, odds: defaultOdds });
      setBookStat("pts"); setBookLine("");
      setTimeout(() => document.getElementById("player-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const loadRoster = async (teamId, teamCode) => {
    setBusy(true); setError(null); setPlayers([]); setScanResults(null);
    try {
      const r = await fetch(`/api/roster?teamId=${teamId}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPlayers(d.players.map(p => ({ ...p, team: teamCode })));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // Scan a team's roster: fetch each player's logs, rank strongest bets
  const scanTeam = async (teamId, teamCode, label) => {
    setScanning(true); setError(null); setScanResults(null); setDraft(null);
    setPlayers([]); setScanLabel(label);
    try {
      const rr = await fetch(`/api/roster?teamId=${teamId}`);
      const rd = await rr.json();
      if (rd.error) throw new Error(rd.error);
      const roster = (rd.players || []).slice(0, 12); // cap for speed

      const all = [];
      // fetch logs in small batches
      for (const pl of roster) {
        try {
          const lr = await fetch(`/api/logs?playerId=${encodeURIComponent(pl.id)}&n=20`);
          const ld = await lr.json();
          if (ld.error || !ld.logs?.length) continue;
          const sugg = autoSuggest(ld.logs, window_, defaultOdds);
          // keep only strong, confident picks
          for (const s of sugg) {
            if (s.edge >= 0.04 && s.n >= 5) {
              all.push({ player: pl, logs: ld.logs, team: teamCode, ...s });
            }
          }
        } catch { /* skip player on error */ }
      }
      all.sort((a, b) => b.p - a.p);
      setScanResults(all.slice(0, 12));
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const addLegFromScan = (item) => {
    if (slate.length >= 10) return;
    setSlate(prev => [...prev, {
      player: item.player, logs: item.logs, stat: item.key, line: item.line,
      side: item.side, odds: defaultOdds, window: window_, team: item.team, id: Date.now(),
    }]);
    setSlipOpen(true);
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

      <header style={{ borderBottom: "1px solid var(--line)", padding: "14px 16px 12px", position: "sticky", top: 0, background: "var(--bg)", zIndex: 50 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase" }}>Risk Desk · 747 Parlay Builder</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontFamily: "Oswald,sans-serif", fontSize: 26, margin: "2px 0 0" }}>PROP DESK</h1>
          <button onClick={() => setShowHelp(!showHelp)} style={{ ...btnGhost, fontSize: 11, padding: "6px 10px" }}>
            {showHelp ? "✕ Close" : "❓ Guide"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={lbl}>Bankroll
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select value={sym} onChange={e => setSym(e.target.value)} style={{ ...inp, width: 58 }}>
                <option value="₱">₱</option><option value="$">$</option>
              </select>
              <input type="number" value={bankroll} onChange={e => setBankroll(Number(e.target.value) || 0)} style={{ ...inp, width: 90 }} />
            </div>
          </label>
          <label style={lbl}>Odds/leg
            <input type="number" step="0.01" value={defaultOdds} onChange={e => setDefaultOdds(Number(e.target.value) || 1.91)} style={{ ...inp, width: 70 }} />
          </label>
          <label style={lbl}>Games
            <input type="number" min="5" max="20" value={window_} onChange={e => setWindow(Math.min(20, Math.max(5, Number(e.target.value) || 10)))} style={{ ...inp, width: 56 }} />
          </label>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 14px 0" }}>

        {showHelp && (
          <section style={panel}>
            <div style={sectionTitle}>How to win with this</div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Fastest way:</b> tap "🔍 Find best bets" on a game below. The app scans every player and ranks the strongest plays automatically.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>To check a 747 line:</b> tap a player, type 747's exact number in the gold box. It shows how often he actually hit it.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Match the line!</b> The app's number must equal 747's, or the % is meaningless.</p>
              <p style={{ color: "var(--red)" }}>Parlay = ALL legs must win. A screening tool, not a guarantee. Bet only what you can lose.</p>
            </div>
          </section>
        )}

        {/* GAMES with scan buttons */}
        {games.length > 0 && (
          <section style={panel}>
            <div style={sectionTitle}>Games — find bets or browse players</div>
            {games.map(g => (
              <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 15 }}>{g.away} @ {g.home}</span>
                  <span style={{ color: "var(--mut)", fontSize: 11, marginLeft: "auto" }}>{g.status}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button style={{ ...btnAmber, flex: 1, minWidth: 130 }} onClick={() => scanTeam(g.awayId, g.away, g.away)}>🔍 Best bets: {g.away}</button>
                  <button style={{ ...btnAmber, flex: 1, minWidth: 130 }} onClick={() => scanTeam(g.homeId, g.home, g.home)}>🔍 Best bets: {g.home}</button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btnGhost, flex: 1, fontSize: 11 }} onClick={() => loadRoster(g.awayId, g.away)}>Browse {g.away} players</button>
                  <button style={{ ...btnGhost, flex: 1, fontSize: 11 }} onClick={() => loadRoster(g.homeId, g.home)}>Browse {g.home} players</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* SCAN RESULTS — the recommendations board */}
        {(scanning || scanResults) && (
          <section style={{ ...panel, border: "1px solid rgba(52,211,153,.3)" }}>
            <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--green)" }}>⭐ Strong bets — {scanLabel}</span>
              {scanResults && <button onClick={() => setScanResults(null)} style={{ ...bigClose }}>✕</button>}
            </div>
            {scanning && <div style={{ color: "var(--amber)", fontSize: 13, padding: "8px 0" }}>Scanning roster… checking each player's recent games. ~10-20s.</div>}
            {scanResults && scanResults.length === 0 && (
              <div style={{ color: "var(--mut)", fontSize: 13 }}>No strong bets found for this team right now (nothing cleared the edge threshold). Try the other team or browse players manually.</div>
            )}
            {scanResults && scanResults.map((s, i) => {
              const v = verdict(s.edge);
              const sideLabel = s.side === "over" ? "Over" : "Under";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {s.player.name} — <span style={{ color: s.side === "over" ? "var(--green)" : "var(--amber)" }}>{sideLabel} {s.line} {s.short}</span>
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
                    <button onClick={() => addLegFromScan(s)} disabled={slate.length >= 10} style={{ ...btnAmber, padding: "8px 12px", fontSize: 16 }}>+</button>
                  </div>
                </div>
              );
            })}
            {scanResults && scanResults.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--mut)" }}>These use the app's own lines. Always confirm against 747's actual line before betting — tap a player to check exact numbers.</div>
            )}
          </section>
        )}

        {/* SEARCH */}
        <section style={panel}>
          <div style={sectionTitle}>Or search any player</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={query} placeholder="e.g. Wembanyama"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              style={{ ...inp, flex: 1 }} />
            <button onClick={() => search()} disabled={busy} style={btnPrimary}>{busy ? "…" : "Search"}</button>
          </div>
          {players.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--mut)" }}>{players.length} players — tap one</span>
                <button onClick={() => setPlayers([])} style={{ ...bigClose }}>✕ Close list</button>
              </div>
              {players.map(p => (
                <button key={p.id} onClick={() => pickPlayer(p)} style={{ ...btnGhost, textAlign: "left", padding: "10px 12px" }}>
                  {p.name} <span style={{ color: "var(--mut)", fontSize: 11 }}>{p.team} {p.position}</span>
                </button>
              ))}
            </div>
          )}
          {error && <div style={errStyle}>{error}</div>}
        </section>

        {/* PLAYER CARD */}
        {draft && (
          <section id="player-card" style={{ ...panel, border: "1px solid rgba(251,191,36,.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 20, fontFamily: "Oswald,sans-serif" }}>{draft.player.name}</div>
                <div style={{ color: "var(--mut)", fontSize: 12 }}>{draft.player.team} · {draft.player.position} · last {window_} games</div>
              </div>
              <button onClick={() => setDraft(null)} style={bigClose}>✕ Close</button>
            </div>

            <div style={{ background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.4)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)", fontFamily: "Oswald,sans-serif", letterSpacing: "0.05em" }}>★ CHECK 747'S LINE</div>
              <div style={{ fontSize: 11, color: "var(--mut)" }}>Type the exact stat & line 747 shows.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={bookStat} onChange={e => setBookStat(e.target.value)} style={{ ...inp, flex: 1 }}>
                  {Object.entries(STAT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="number" step="0.5" value={bookLine} placeholder="e.g. 30"
                  onChange={e => setBookLine(e.target.value)} style={{ ...inp, flex: 1 }} />
              </div>

              {bookEval && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ ...sideBox, borderColor: bookEval.over > bookEval.under ? "var(--green)" : "var(--line)" }}>
                      <div style={miniLbl}>OVER {bookEval.line}</div>
                      <div style={{ ...miniVal, fontSize: 22, color: bookEval.over >= 0.6 ? "var(--green)" : bookEval.over <= 0.4 ? "var(--red)" : "var(--amber)" }}>{fmtPct(bookEval.over)}</div>
                      <div style={{ fontSize: 10, color: "var(--mut)" }}>hit {bookEval.overHits}/{bookEval.n}</div>
                      <button onClick={() => addLeg(bookStat, bookEval.line, "over", draft.odds)} disabled={slate.length >= 10} style={{ ...btnGhost, fontSize: 11, padding: "6px 8px", marginTop: 6, width: "100%" }}>+ Over</button>
                    </div>
                    <div style={{ ...sideBox, borderColor: bookEval.under > bookEval.over ? "var(--green)" : "var(--line)" }}>
                      <div style={miniLbl}>UNDER {bookEval.line}</div>
                      <div style={{ ...miniVal, fontSize: 22, color: bookEval.under >= 0.6 ? "var(--green)" : bookEval.under <= 0.4 ? "var(--red)" : "var(--amber)" }}>{fmtPct(bookEval.under)}</div>
                      <div style={{ fontSize: 10, color: "var(--mut)" }}>hit {bookEval.underHits}/{bookEval.n}</div>
                      <button onClick={() => addLeg(bookStat, bookEval.line, "under", draft.odds)} disabled={slate.length >= 10} style={{ ...btnGhost, fontSize: 11, padding: "6px 8px", marginTop: 6, width: "100%" }}>+ Under</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, textAlign: "center", padding: 6, background: "rgba(0,0,0,.25)", borderRadius: 6 }}>
                    Lean: <b style={{ color: verdict(bookEval.edge).color }}>{bookEval.best.toUpperCase()} {bookEval.line}</b> — {verdict(bookEval.edge).text}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {bookEval.vals.map((v, i) => <Chip key={i} val={v} hit={bookEval.best === "over" ? v > bookEval.line : v < bookEval.line} />)}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)", marginBottom: 4, fontFamily: "'IBM Plex Mono',monospace" }}>His strongest stats</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map(s => {
                  const v = verdict(s.edge);
                  const sideLabel = s.side === "over" ? "Over" : "Under";
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label} — <span style={{ color: s.side === "over" ? "var(--green)" : "var(--amber)" }}>{sideLabel} {s.line}</span></div>
                        <div style={{ fontSize: 11, color: "var(--mut)", fontFamily: "'IBM Plex Mono',monospace" }}>{sideLabel === "Over" ? "went over" : "stayed under"} {s.hits}/{s.n} · avg {s.avg.toFixed(1)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: v.color, fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(s.p)}</div>
                          <div style={{ fontSize: 9, color: v.color }}>{v.text}</div>
                        </div>
                        <button onClick={() => addLeg(s.key, s.line, s.side, draft.odds)} disabled={slate.length >= 10} style={{ ...btnAmber, padding: "8px 12px", fontSize: 16 }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* PARLAY */}
        {parlays.length > 0 && (
          <section style={panel}>
            <div style={sectionTitle}>Recommended Parlays</div>
            {parlays.map(pl => {
              const { dec, adjP, ev, extraSameTeam } = priceParlay(pl.legs);
              return (
                <div key={pl.name} style={{ ...card, borderColor: ev >= 0 ? "rgba(52,211,153,.3)" : "var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 16, color: "var(--amber)" }}>{pl.emoji} {pl.name} — {pl.legs.length} legs</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: ev >= 0 ? "var(--green)" : "var(--red)" }}>{ev >= 0 ? "+EV ✓" : "−EV ✗"}</span>
                  </div>
                  {pl.legs.map((l, i) => (
                    <div key={i} style={{ fontSize: 12 }}>• {l.player.name} {STAT_TYPES[l.stat].label} {l.side === "over" ? "O" : "U"}{l.line} <span style={{ color: "var(--mut)" }}>({fmtPct(l.p)})</span></div>
                  ))}
                  <SegBar p={adjP} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    {[["Chance ALL hit", fmtPct(adjP)], ["Payout", `${dec.toFixed(2)}x`], [`Bet ${fmtCash(stake, sym)} →`, fmtCash(stake * dec, sym)]].map(([k, v]) => (
                      <div key={k} style={miniStat}><div style={miniLbl}>{k}</div><div style={miniVal}>{v}</div></div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <footer style={{ fontSize: 11, color: "var(--mut)", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
          Real ESPN game logs. Estimates, not predictions. Match the app's line to 747's or the % means nothing. Bet only what you can afford to lose.
        </footer>
      </div>

      {/* STICKY SLIP */}
      {legs.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1117", borderTop: "2px solid var(--amber)", zIndex: 100 }}>
          <button onClick={() => setSlipOpen(!slipOpen)} style={{ width: "100%", background: "transparent", border: "none", color: "var(--amber)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "Oswald,sans-serif", fontSize: 15 }}>
            <span>🎰 MY PARLAY — {legs.length} legs</span>
            {slip && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>{slip.dec.toFixed(2)}x · {fmtPct(slip.adjP)}</span>}
            <span>{slipOpen ? "▼" : "▲"}</span>
          </button>
          {slipOpen && (
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10, maxHeight: "60vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>⚠ ALL {legs.length} must win</span>
                <button onClick={() => setSlate([])} style={{ ...bigClose }}>Clear all</button>
              </div>
              {legs.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <span>{l.player.name} {STAT_TYPES[l.stat].short} {l.side === "over" ? "O" : "U"}{l.line}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: l.edge >= 0 ? "var(--green)" : "var(--red)", fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(l.p)}</span>
                    <button onClick={() => removeLeg(l.id)} style={{ ...bigClose, color: "var(--red)" }}>✕</button>
                  </div>
                </div>
              ))}
              {slip && (
                <>
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                    <label style={{ ...lbl, flex: 1 }}>Bet ({sym})
                      <input type="number" value={stake} onChange={e => setStake(Number(e.target.value) || 0)} style={inp} />
                    </label>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" }}>If all hit</div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, color: "var(--amber)" }}>{fmtCash(stake * slip.dec, sym)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>Chance all hit: <b style={{ color: slip.adjP > 0.3 ? "var(--green)" : "var(--amber)" }}>{fmtPct(slip.adjP)}</b></div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inp = { background: "#0c1118", border: "1px solid var(--line)", borderRadius: 6, color: "var(--tx)", padding: "9px 10px", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", width: "100%", boxSizing: "border-box" };
const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" };
const btnPrimary = { background: "var(--amber)", color: "#0a0e14", border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Oswald,sans-serif", letterSpacing: "0.05em" };
const btnAmber = { background: "rgba(251,191,36,.15)", color: "var(--amber)", border: "1px solid var(--amber)", borderRadius: 6, padding: "9px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer" };
const btnGhost = { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, color: "var(--amber)", padding: "9px 12px", fontSize: 12, cursor: "pointer" };
const bigClose = { background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 6, color: "var(--red)", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
const panel = { background: "#11161f", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 };
const card = { background: "rgba(0,0,0,.2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const sectionTitle = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" };
const errStyle = { color: "var(--red)", fontSize: 12, background: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 6, padding: "8px 12px" };
const sideBox = { background: "rgba(0,0,0,.3)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 };
const miniStat = { background: "rgba(0,0,0,.3)", borderRadius: 6, padding: "8px 10px", textAlign: "center" };
const miniLbl = { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mut)" };
const miniVal = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: "var(--tx)", marginTop: 2 };
