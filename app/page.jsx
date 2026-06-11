"use client";
import { useState, useMemo, useEffect } from "react";
import {
  STAT_TYPES, impliedProb, weightedShrunkProb, kellyStake,
  priceParlay, recommendParlays, autoSuggest, decimalToAmerican,
} from "../lib/engine";

const fmtPct = (x, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const fmtNum = (x, dp = 1) => Number(x).toFixed(dp);
const fmtCash = (x, sym) => `${sym}${Math.abs(x).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

function SegBar({ p, segs = 20 }) {
  const lit = Math.round(p * segs);
  const col = p >= 0.56 ? "var(--green)" : p <= 0.44 ? "var(--red)" : "var(--amber)";
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 14, borderRadius: 2,
          background: i < lit ? col : "#1a212c",
          transition: "background .25s",
        }} />
      ))}
    </div>
  );
}

function Chip({ val, hit }) {
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
      padding: "2px 6px", borderRadius: 4,
      border: `1px solid ${hit ? "rgba(52,211,153,.4)" : "rgba(248,113,113,.3)"}`,
      color: hit ? "var(--green)" : "var(--red)",
      background: hit ? "rgba(52,211,153,.07)" : "rgba(248,113,113,.07)",
    }}>{val}</span>
  );
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
      setPlayers(d.players);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const pickPlayer = async (p) => {
    setBusy(true); setError(null); setPlayers([]);
    try {
      const r = await fetch(`/api/logs?playerId=${p.id}&n=20`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDraft({ player: p, logs: d.logs, stat: "pts", line: 20.5, side: "over", odds: defaultOdds, window: 10 });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const loadRoster = async (teamId, teamCode) => {
    setBusy(true); setError(null);
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

  // Draft computed values
  const draftVals = draft ? draft.logs.slice(0, draft.window).map(STAT_TYPES[draft.stat].calc) : [];
  const draftProb = draft ? weightedShrunkProb(draftVals, draft.line, draft.side) : null;
  const draftEdge = draft && draftProb ? draftProb.p - impliedProb(draft.odds) : 0;
  const draftKelly = draft && draftProb
    ? kellyStake(draftProb.p, draft.odds, bankroll)
    : 0;
  const suggestions = useMemo(() =>
    draft ? autoSuggest(draft.logs, draft.window, draft.odds).slice(0, 5) : []
  , [draft]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--tx)", fontFamily: "Inter,sans-serif", paddingBottom: 120 }}>

      {/* ── HEADER ── */}
      <header style={{ borderBottom: "1px solid var(--line)", padding: "14px 16px 12px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase" }}>Risk Desk · 747 Parlay Builder</div>
        <h1 style={{ fontFamily: "Oswald,sans-serif", fontSize: 28, margin: "2px 0 0" }}>PROP DESK</h1>
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={lbl}>
            Bankroll
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select value={sym} onChange={e => setSym(e.target.value)} style={{ ...inp, width: 60 }}>
                <option value="₱">₱ PHP</option>
                <option value="$">$ USD</option>
              </select>
              <input type="number" value={bankroll} onChange={e => setBankroll(Number(e.target.value) || 0)}
                style={{ ...inp, width: 100 }} />
            </div>
          </label>
          <label style={lbl}>
            Default odds (decimal)
            <input type="number" step="0.01" value={defaultOdds}
              onChange={e => setDefaultOdds(Number(e.target.value) || 1.91)}
              style={{ ...inp, width: 80 }} />
          </label>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 14px" }}>

        {/* ── TODAY'S GAMES ── */}
        {games.length > 0 && (
          <section style={panel}>
            <div style={sectionTitle}>Today's Games — tap a team to browse players</div>
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

        {/* ── SEARCH ── */}
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

        {/* ── DRAFT CARD ── */}
        {draft && draftProb && (
          <section style={{ ...panel, border: "1px solid rgba(251,191,36,.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 20, fontFamily: "Oswald,sans-serif" }}>{draft.player.name}</div>
                <div style={{ color: "var(--mut)", fontSize: 12 }}>{draft.player.team} · {draft.player.position}</div>
              </div>
              <button onClick={() => setDraft(null)} style={{ ...btnGhost, padding: "4px 8px" }}>✕</button>
            </div>

            {/* Suggested picks */}
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)", marginBottom: 6 }}>Auto-suggested picks at odds {draft.odds}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {suggestions.map(s => (
                  <button key={s.key} onClick={() => setDraft({ ...draft, stat: s.key, line: s.line })}
                    style={{
                      ...btnGhost, fontSize: 11, padding: "5px 10px",
                      borderColor: s.edge > 0.03 ? "var(--green)" : s.edge > 0 ? "var(--amber)" : "var(--line)",
                      color: s.edge > 0.03 ? "var(--green)" : s.edge > 0 ? "var(--amber)" : "var(--mut)",
                    }}>
                    {s.short} o{s.line} · {fmtPct(s.p)} ({s.hits}/{s.n})
                    {s.edge > 0.03 ? " 🔥" : s.edge > 0 ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Config */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
              <label style={lbl}>Stat
                <select value={draft.stat} onChange={e => setDraft({ ...draft, stat: e.target.value })} style={inp}>
                  {Object.entries(STAT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label style={lbl}>Line
                <input type="number" step="0.5" value={draft.line}
                  onChange={e => setDraft({ ...draft, line: Number(e.target.value) })} style={inp} />
              </label>
              <label style={lbl}>Side
                <select value={draft.side} onChange={e => setDraft({ ...draft, side: e.target.value })} style={inp}>
                  <option value="over">Over</option>
                  <option value="under">Under</option>
                </select>
              </label>
              <label style={lbl}>Odds (decimal)
                <input type="number" step="0.01" value={draft.odds}
                  onChange={e => setDraft({ ...draft, odds: Number(e.target.value) || 1.91 })} style={inp} />
              </label>
            </div>

            <label style={lbl}>Sample: last {draft.window} games
              <input type="range" min="5" max="20" value={draft.window}
                onChange={e => setDraft({ ...draft, window: Number(e.target.value) })} style={{ width: "100%", accentColor: "var(--amber)" }} />
            </label>

            {/* Log chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {draftVals.map((v, i) => <Chip key={i} val={v} hit={draft.side === "over" ? v > draft.line : v < draft.line} />)}
            </div>

            <SegBar p={draftProb.p} />

            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--mut)", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>raw {draftProb.hits}/{draftProb.n}</span>
              <span style={{ color: "var(--tx)" }}>P: {fmtPct(draftProb.p)}</span>
              <span>break-even: {fmtPct(impliedProb(draft.odds))}</span>
              <span style={{ color: draftEdge >= 0 ? "var(--green)" : "var(--red)" }}>
                edge: {draftEdge >= 0 ? "+" : ""}{fmtPct(draftEdge)}
              </span>
              <span>¼K: <b style={{ color: "var(--amber)" }}>{fmtCash(draftKelly, sym)}</b></span>
            </div>

            <button
              onClick={() => addToSlip({ player: draft.player, logs: draft.logs, stat: draft.stat, line: draft.line, side: draft.side, odds: draft.odds, window: draft.window, team: draft.player.team })}
              disabled={slate.length >= 10}
              style={{ ...btnPrimary, width: "100%" }}>
              {slate.length >= 10 ? "10-leg limit" : `+ Add to Parlay Slip (${slate.length}/10)`}
            </button>
          </section>
        )}

        {/* ── SLATE ── */}
        {legs.length > 0 && (
          <section style={panel}>
            <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between" }}>
              <span>Slip — {legs.length}/10 legs</span>
              <button onClick={() => setSlate([])} style={{ ...btnGhost, fontSize: 11, padding: "2px 8px" }}>Clear all</button>
            </div>
            {legs.map(l => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{l.player.name}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--mut)" }}>
                    {l.side} {l.line} {STAT_TYPES[l.stat].short} · odds {l.odds} ({decimalToAmerican(l.odds)}) ·{" "}
                    <span style={{ color: l.edge >= 0 ? "var(--green)" : "var(--red)" }}>{l.edge >= 0 ? "+" : ""}{fmtPct(l.edge)}</span>
                    {" "}· P {fmtPct(l.p)}
                  </div>
                </div>
                <button onClick={() => removeLeg(l.id)} style={{ ...btnGhost, padding: "4px 8px", color: "var(--red)" }}>✕</button>
              </div>
            ))}
          </section>
        )}

        {/* ── AUTO PARLAY RECOMMENDATIONS ── */}
        {parlays.length > 0 && (
          <section style={panel}>
            <div style={sectionTitle}>Recommended Parlays</div>
            {parlays.map(pl => {
              const { dec, adjP, ev, extraSameTeam } = priceParlay(pl.legs);
              const payout = stake * dec;
              return (
                <div key={pl.name} style={{ ...card, borderColor: ev >= 0 ? "rgba(52,211,153,.3)" : "var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 16, color: "var(--amber)" }}>{pl.emoji} {pl.name} — {pl.legs.length} legs</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: ev >= 0 ? "var(--green)" : "var(--red)" }}>
                      EV {ev >= 0 ? "+" : ""}{ev.toFixed(3)}
                    </span>
                  </div>
                  {pl.legs.map((l, i) => (
                    <div key={i} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--mut)" }}>
                      {l.player.name} {l.side} {l.line} {STAT_TYPES[l.stat].short} @ {l.odds} · {fmtPct(l.p)}
                    </div>
                  ))}
                  <SegBar p={adjP} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    {[["Combined", `${dec.toFixed(2)}x`],["Hit P*", fmtPct(adjP)],[`Payout`, fmtCash(payout, sym)]].map(([k,v]) => (
                      <div key={k} style={{ background: "rgba(0,0,0,.3)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" }}>{k}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: "var(--tx)" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>
                    Over 100 plays at {fmtCash(stake, sym)}: ~{Math.round(adjP * 100)} wins → expected {fmtCash((adjP * (dec - 1) - (1 - adjP)) * 100 * stake, sym)}.
                    {extraSameTeam > 0 && " Same-team correlation haircut applied."}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {legs.length >= 2 && parlays.length === 0 && (
          <div style={{ ...panel, color: "var(--mut)", fontSize: 13 }}>
            No parlay recommended — fewer than 2 legs show positive edge at your odds. That's the system working.
          </div>
        )}

        <footer style={{ fontSize: 11, color: "var(--mut)", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
          Hit rates from real NBA.com game logs, shrunk toward 50%. *Hit P adjusted for same-team correlation.
          Bet only what survives being wrong.
        </footer>
      </div>

      {/* ── STICKY BOTTOM SLIP ── */}
      {legs.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#0d1117", borderTop: "2px solid var(--amber)",
          zIndex: 100,
        }}>
          <button onClick={() => setSlipOpen(!slipOpen)}
            style={{ width: "100%", background: "transparent", border: "none", color: "var(--amber)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "Oswald,sans-serif", fontSize: 15 }}>
            <span>🎰 PARLAY SLIP — {legs.length} legs</span>
            {slip && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>{slip.dec.toFixed(2)}x · {fmtPct(slip.adjP)} hit P</span>}
            <span>{slipOpen ? "▼" : "▲"}</span>
          </button>
          {slipOpen && slip && (
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {legs.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>
                  <span style={{ color: "var(--tx)" }}>{l.player.name} {l.side} {l.line} {STAT_TYPES[l.stat].short}</span>
                  <span style={{ color: l.edge >= 0 ? "var(--green)" : "var(--red)" }}>{fmtPct(l.p)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <label style={{ ...lbl, flex: 1 }}>Stake ({sym})
                  <input type="number" value={stake} onChange={e => setStake(Number(e.target.value) || 0)} style={{ ...inp }} />
                </label>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" }}>Potential payout</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, color: "var(--amber)" }}>{fmtCash(stake * slip.dec, sym)}</div>
                </div>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--mut)" }}>
                combined odds: {slip.dec.toFixed(3)}x · hit P: {fmtPct(slip.adjP)} · EV/{sym}1: <span style={{ color: slip.ev >= 0 ? "var(--green)" : "var(--red)" }}>{slip.ev >= 0 ? "+" : ""}{slip.ev.toFixed(3)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── styles ──
const inp = { background: "#0c1118", border: "1px solid var(--line)", borderRadius: 6, color: "var(--tx)", padding: "8px 10px", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", width: "100%", boxSizing: "border-box" };
const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--mut)" };
const btnPrimary = { background: "var(--amber)", color: "#0a0e14", border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Oswald,sans-serif", letterSpacing: "0.05em" };
const btnGhost = { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, color: "var(--amber)", padding: "8px 12px", fontSize: 12, cursor: "pointer" };
const panel = { background: "#11161f", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 };
const card = { background: "rgba(0,0,0,.2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const sectionTitle = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" };
const teamBtn = { ...btnGhost, padding: "6px 12px", fontSize: 13, fontFamily: "Oswald,sans-serif", fontWeight: 600 };
const errStyle = { color: "var(--red)", fontSize: 12, background: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 6, padding: "8px 12px" };
