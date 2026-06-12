"use client";
import { useState, useMemo, useEffect } from "react";
import {
  STAT_TYPES, impliedProb, weightedShrunkProb, kellyStake,
  priceParlay, recommendParlays, autoSuggest, evalLine, parseSlip,
} from "../lib/engine";

const fmtPct = (x, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const fmtCash = (x, sym) => `${sym}${Math.abs(x).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const TRACK_KEY = "propdesk_bets_v1";

const STAT_GROUPS = [
  { label: "Points", keys: ["pts"] },
  { label: "Rebounds", keys: ["reb"] },
  { label: "Assists", keys: ["ast"] },
  { label: "Threes", keys: ["fg3m"] },
  { label: "Blocks", keys: ["blk"] },
  { label: "Steals", keys: ["stl"] },
  { label: "Blocks+Steals", keys: ["bs"] },
  { label: "Pts+Reb+Ast", keys: ["pra"] },
  { label: "Pts+Reb", keys: ["pr"] },
  { label: "Pts+Ast", keys: ["pa"] },
  { label: "Reb+Ast", keys: ["ra"] },
  { label: "Turnovers", keys: ["to"] },
];

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

function InlineCheck({ item, window_, defaultOdds, onAdd, sym }) {
  const [stat, setStat] = useState(item.key);
  const [line, setLine] = useState(String(item.line));
  const ev = useMemo(() => {
    if (line === "" || isNaN(Number(line))) return null;
    return evalLine(item.logs, window_, stat, Number(line), defaultOdds);
  }, [item, stat, line, window_, defaultOdds]);

  return (
    <div style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.35)", borderRadius: 8, padding: 10, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" }}>★ CHECK 747'S LINE — {item.player.name}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <select value={stat} onChange={e => setStat(e.target.value)} style={{ ...inp, flex: 1, fontSize: 12 }}>
          {Object.entries(STAT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="number" step="0.5" value={line} placeholder="747 line" onChange={e => setLine(e.target.value)} style={{ ...inp, flex: 1, fontSize: 12 }} />
      </div>
      {ev && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div style={{ ...sideBox, borderColor: ev.over > ev.under ? "var(--green)" : "var(--line)" }}>
              <div style={miniLbl}>OVER {ev.line}</div>
              <div style={{ ...miniVal, fontSize: 18, color: ev.over >= 0.6 ? "var(--green)" : ev.over <= 0.4 ? "var(--red)" : "var(--amber)" }}>{fmtPct(ev.over)}</div>
              <div style={{ fontSize: 9, color: "var(--mut)" }}>hit {ev.overHits}/{ev.n}</div>
              <button onClick={() => onAdd(item, stat, ev.line, "over")} style={{ ...btnGhost, fontSize: 10, padding: "4px 6px", marginTop: 4, width: "100%" }}>+ Over</button>
            </div>
            <div style={{ ...sideBox, borderColor: ev.under > ev.over ? "var(--green)" : "var(--line)" }}>
              <div style={miniLbl}>UNDER {ev.line}</div>
              <div style={{ ...miniVal, fontSize: 18, color: ev.under >= 0.6 ? "var(--green)" : ev.under <= 0.4 ? "var(--red)" : "var(--amber)" }}>{fmtPct(ev.under)}</div>
              <div style={{ fontSize: 9, color: "var(--mut)" }}>hit {ev.underHits}/{ev.n}</div>
              <button onClick={() => onAdd(item, stat, ev.line, "under")} style={{ ...btnGhost, fontSize: 10, padding: "4px 6px", marginTop: 4, width: "100%" }}>+ Under</button>
            </div>
          </div>
          <div style={{ fontSize: 11, textAlign: "center", padding: 5, background: "rgba(0,0,0,.25)", borderRadius: 5 }}>
            Lean: <b style={{ color: verdict(ev.edge).color }}>{ev.best.toUpperCase()} {ev.line}</b> — {verdict(ev.edge).text}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {ev.vals.map((v, i) => <Chip key={i} val={v} hit={ev.best === "over" ? v > ev.line : v < ev.line} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default function PropDesk() {
  const [bankroll, setBankroll] = useState(5000);
  const [sym, setSym] = useState("₱");
  const [defaultOdds, setDefaultOdds] = useState(1.91);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [listLabel, setListLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [slate, setSlate] = useState([]);
  const [draft, setDraft] = useState(null);
  const [window_, setWindow] = useState(10);
  const [games, setGames] = useState([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [stake, setStake] = useState(100);
  const [showHelp, setShowHelp] = useState(false);
  const [tab, setTab] = useState("build");

  const [bookStat, setBookStat] = useState("pts");
  const [bookLine, setBookLine] = useState("");

  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [scanLabel, setScanLabel] = useState("");
  const [scanGroup, setScanGroup] = useState("all");
  const [minHits, setMinHits] = useState(0);
  const [openCheck, setOpenCheck] = useState(null);

  // paste-slip state
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteResults, setPasteResults] = useState(null);

  const [tracked, setTracked] = useState([]);
  useEffect(() => {
    try { const raw = localStorage.getItem(TRACK_KEY); if (raw) setTracked(JSON.parse(raw)); } catch {}
  }, []);
  const saveTracked = (next) => {
    setTracked(next);
    try { localStorage.setItem(TRACK_KEY, JSON.stringify(next)); } catch {}
  };

  useEffect(() => {
    fetch("/api/games").then(r => r.json()).then(d => setGames(d.games || [])).catch(() => {});
  }, []);

  const search = async (q) => {
    const sq = (q || query).trim();
    if (!sq) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/player?q=${encodeURIComponent(sq)}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.players.length) throw new Error("No players found — try a different spelling.");
      setPlayers(d.players); setListLabel(`Search: "${sq}"`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const pickPlayer = async (p) => {
    setBusy(true); setError(null);
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
    setBusy(true); setError(null); setScanResults(null);
    try {
      const r = await fetch(`/api/roster?teamId=${teamId}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPlayers(d.players.map(p => ({ ...p, team: teamCode }))); setListLabel(`${teamCode} roster`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const scanTeam = async (teamId, teamCode, label) => {
    setScanning(true); setError(null); setScanResults(null); setOpenCheck(null); setScanGroup("all"); setMinHits(0);
    setScanLabel(label);
    try {
      const rr = await fetch(`/api/roster?teamId=${teamId}`);
      const rd = await rr.json();
      if (rd.error) throw new Error(rd.error);
      const roster = (rd.players || []).slice(0, 12);
      const all = [];
      for (const pl of roster) {
        try {
          const lr = await fetch(`/api/logs?playerId=${encodeURIComponent(pl.id)}&n=20`);
          const ld = await lr.json();
          if (ld.error || !ld.logs?.length) continue;
          const sugg = autoSuggest(ld.logs, window_, defaultOdds);
          for (const s of sugg) {
            if (s.edge >= 0.04 && s.n >= 5) all.push({ player: pl, logs: ld.logs, team: teamCode, ...s });
          }
        } catch {}
      }
      all.sort((a, b) => b.p - a.p);
      setScanResults(all.slice(0, 30));
      setTimeout(() => document.getElementById("scan-board")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) { setError(e.message); } finally { setScanning(false); }
  };

  // ── paste slip: parse, resolve each player, evaluate each leg ──
  const analyzeSlip = async () => {
    const parsed = parseSlip(pasteText);
    if (!parsed.length) { setError("Couldn't read any legs. Check the format."); return; }
    setPasteBusy(true); setError(null); setPasteResults(null);
    const out = [];
    for (const leg of parsed) {
      if (leg.error || !leg.stat || !leg.side || leg.line == null) {
        out.push({ ...leg, status: "unparsed" });
        continue;
      }
      try {
        const sr = await fetch(`/api/player?q=${encodeURIComponent(leg.name)}`);
        const sd = await sr.json();
        let player = (sd.players || [])[0];
        // fallback: retry on last name only (handles "D. Fox" → "Fox")
        if (!player) {
          const last = leg.name.split(/\s+/).pop();
          if (last && last.length > 2) {
            const sr2 = await fetch(`/api/player?q=${encodeURIComponent(last)}`);
            const sd2 = await sr2.json();
            player = (sd2.players || [])[0];
          }
        }
        if (!player) { out.push({ ...leg, status: "noplayer" }); continue; }
        const lr = await fetch(`/api/logs?playerId=${encodeURIComponent(player.id)}&n=20`);
        const ld = await lr.json();
        if (ld.error || !ld.logs?.length) { out.push({ ...leg, player, status: "nologs" }); continue; }
        const ev = evalLine(ld.logs, window_, leg.stat, leg.line, defaultOdds);
        const p = leg.side === "over" ? ev.over : ev.under;
        const hits = leg.side === "over" ? ev.overHits : ev.underHits;
        out.push({ ...leg, player, logs: ld.logs, p, hits, n: ev.n, vals: ev.vals, status: "ok" });
      } catch {
        out.push({ ...leg, status: "error" });
      }
    }
    setPasteResults(out);
    setPasteBusy(false);
  };

  const addLegFromScan = (item) => {
    if (slate.length >= 10) return;
    setSlate(prev => [...prev, {
      player: item.player, logs: item.logs, stat: item.key, line: item.line,
      side: item.side, odds: defaultOdds, window: window_, team: item.team, id: Date.now() + Math.random(),
    }]);
    setSlipOpen(true);
  };

  const addFromInline = (item, stat, line, side) => {
    if (slate.length >= 10) return;
    setSlate(prev => [...prev, {
      player: item.player, logs: item.logs, stat, line, side,
      odds: defaultOdds, window: window_, team: item.team, id: Date.now() + Math.random(),
    }]);
    setSlipOpen(true);
  };

  const addLeg = (stat, line, side, odds) => {
    if (slate.length >= 10) return;
    setSlate(prev => [...prev, {
      player: draft.player, logs: draft.logs, stat, line, side,
      odds: odds || draft.odds, window: window_, team: draft.player.team, id: Date.now() + Math.random(),
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

  const groupedScan = useMemo(() => {
    if (!scanResults) return null;
    let f = scanResults;
    if (scanGroup !== "all") {
      const keys = STAT_GROUPS.find(g => g.label === scanGroup)?.keys || [];
      f = f.filter(s => keys.includes(s.key));
    }
    if (minHits > 0) f = f.filter(s => s.hits >= minHits);
    return f;
  }, [scanResults, scanGroup, minHits]);

  const availableGroups = useMemo(() => {
    if (!scanResults) return [];
    return STAT_GROUPS.filter(g => scanResults.some(s => g.keys.includes(s.key)));
  }, [scanResults]);

  const pasteParlay = useMemo(() => {
    if (!pasteResults) return null;
    const ok = pasteResults.filter(r => r.status === "ok");
    if (ok.length < 2) return null;
    const teams = ok.map(r => r.player?.team || "?");
    const naiveP = ok.reduce((a, r) => a * r.p, 1);
    const extraSameTeam = ok.length - new Set(teams).size;
    const adjP = naiveP * Math.max(0.3, 1 - 0.1 * extraSameTeam);
    const dec = Math.pow(defaultOdds, ok.length);
    return { naiveP, adjP, dec, legs: ok.length, extraSameTeam };
  }, [pasteResults, defaultOdds]);

  const saveBet = () => {
    if (!legs.length) return;
    const dec = legs.reduce((a, l) => a * l.odds, 1);
    const ticket = {
      id: Date.now(), date: new Date().toISOString().slice(0, 10),
      stake, dec, payout: stake * dec,
      legs: legs.map(l => ({ name: l.player.name, stat: STAT_TYPES[l.stat].short, side: l.side, line: l.line, p: l.p })),
      status: "pending",
    };
    saveTracked([ticket, ...tracked]);
    setSlate([]); setTab("tracker");
  };

  const savePasteSlip = () => {
    if (!pasteParlay) return;
    const ok = pasteResults.filter(r => r.status === "ok");
    const ticket = {
      id: Date.now(), date: new Date().toISOString().slice(0, 10),
      stake, dec: pasteParlay.dec, payout: stake * pasteParlay.dec,
      legs: ok.map(r => ({ name: r.player.name, stat: STAT_TYPES[r.stat].short, side: r.side, line: r.line, p: r.p })),
      status: "pending",
    };
    saveTracked([ticket, ...tracked]);
    setPasteResults(null); setPasteText(""); setTab("tracker");
  };

  const markBet = (id, status) => saveTracked(tracked.map(t => t.id === id ? { ...t, status } : t));
  const delBet = (id) => saveTracked(tracked.filter(t => t.id !== id));

  const record = useMemo(() => {
    const won = tracked.filter(t => t.status === "won");
    const lost = tracked.filter(t => t.status === "lost");
    const profit = won.reduce((a, t) => a + (t.payout - t.stake), 0) - lost.reduce((a, t) => a + t.stake, 0);
    return { won: won.length, lost: lost.length, pending: tracked.filter(t => t.status === "pending").length, profit };
  }, [tracked]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--tx)", fontFamily: "Inter,sans-serif", paddingBottom: 120 }}>

      <header style={{ borderBottom: "1px solid var(--line)", padding: "12px 16px", position: "sticky", top: 0, background: "var(--bg)", zIndex: 50 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase" }}>747 Parlay Builder</div>
            <h1 style={{ fontFamily: "Oswald,sans-serif", fontSize: 24, margin: "1px 0 0" }}>PROP DESK</h1>
          </div>
          <button onClick={() => setShowHelp(!showHelp)} style={{ ...btnGhost, fontSize: 11, padding: "6px 10px" }}>{showHelp ? "✕" : "❓ Guide"}</button>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
          <button onClick={() => setTab("build")} style={tab === "build" ? tabOn : tabOff}>Build</button>
          <button onClick={() => setTab("paste")} style={tab === "paste" ? tabOn : tabOff}>Paste Slip</button>
          <button onClick={() => setTab("tracker")} style={tab === "tracker" ? tabOn : tabOff}>
            My Bets {tracked.length > 0 && `(${record.won}-${record.lost})`}
          </button>
        </div>
        {tab !== "tracker" && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={lbl}>Bankroll
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <select value={sym} onChange={e => setSym(e.target.value)} style={{ ...inp, width: 50 }}>
                  <option value="₱">₱</option><option value="$">$</option>
                </select>
                <input type="number" value={bankroll} onChange={e => setBankroll(Number(e.target.value) || 0)} style={{ ...inp, width: 84 }} />
              </div>
            </label>
            <label style={lbl}>Odds/leg
              <input type="number" step="0.01" value={defaultOdds} onChange={e => setDefaultOdds(Number(e.target.value) || 1.91)} style={{ ...inp, width: 66 }} />
            </label>
            <label style={lbl}>Games
              <input type="number" min="5" max="20" value={window_} onChange={e => setWindow(Math.min(20, Math.max(5, Number(e.target.value) || 10)))} style={{ ...inp, width: 52 }} />
            </label>
          </div>
        )}
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 14px 0" }}>

        {showHelp && (
          <section style={panel}>
            <div style={sectionTitle}>How to win with this</div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Paste Slip:</b> copy your whole 747 bet slip, paste it in the "Paste Slip" tab, and see the win rate of every leg + the full parlay at once.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Best bets:</b> tap "🔍 Best bets" on a game — results grouped by stat. Filter by minimum hit rate (6+, 7+, 8+). Tap any pick to check 747's line.</p>
              <p style={{ marginBottom: 8 }}><b style={{ color: "var(--amber)" }}>Track:</b> save a bet, mark it Won/Lost to see if these picks actually make money.</p>
              <p style={{ color: "var(--red)" }}>Parlay = ALL legs must win. Screening tool, not a guarantee. Bet only what you can lose.</p>
            </div>
          </section>
        )}

        {/* ───────── PASTE SLIP TAB ───────── */}
        {tab === "paste" && (
          <>
            <section style={panel}>
              <div style={sectionTitle}>Paste your 747 slip</div>
              <div style={{ fontSize: 12, color: "var(--mut)" }}>
                Copy your bet slip from 747 and paste it below. One leg per line, e.g.:<br />
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>Player points - Victor Wembanyama under 28.5</span>
              </div>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={7}
                placeholder={"Player steals - O.G. Anunoby over 1.5\nPlayer blocks - Victor Wembanyama under 3.5\nPlayer rebounds - Victor Wembanyama under 11.5\nPlayer assists - Jalen Brunson under 6.5\nPlayer three pointers - Mikal Bridges under 1.5\nPlayer points - Victor Wembanyama under 28.5"}
                style={{ ...inp, fontSize: 12, lineHeight: 1.5, resize: "vertical" }} />
              <button onClick={analyzeSlip} disabled={pasteBusy} style={{ ...btnPrimary, width: "100%" }}>
                {pasteBusy ? "Analyzing each leg…" : "📊 Analyze slip"}
              </button>
              {error && <div style={errStyle}>{error}</div>}
            </section>

            {pasteResults && (
              <>
                {pasteParlay && (
                  <section style={{ ...panel, border: "1px solid rgba(251,191,36,.4)" }}>
                    <div style={{ ...sectionTitle, color: "var(--amber)" }}>Parlay win rate — {pasteParlay.legs} legs</div>
                    <SegBar p={pasteParlay.adjP} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      <div style={miniStat}><div style={miniLbl}>Chance ALL hit</div><div style={{ ...miniVal, color: pasteParlay.adjP > 0.3 ? "var(--green)" : pasteParlay.adjP > 0.1 ? "var(--amber)" : "var(--red)" }}>{fmtPct(pasteParlay.adjP)}</div></div>
                      <div style={miniStat}><div style={miniLbl}>Payout</div><div style={miniVal}>{pasteParlay.dec.toFixed(2)}x</div></div>
                      <div style={miniStat}><div style={miniLbl}>{fmtCash(stake, sym)} →</div><div style={{ ...miniVal, color: "var(--amber)" }}>{fmtCash(stake * pasteParlay.dec, sym)}</div></div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--mut)" }}>
                      ⚠ ALL {pasteParlay.legs} legs must win. Win rate is the product of each leg's chance{pasteParlay.extraSameTeam > 0 ? ", adjusted down for same-team correlation" : ""}.
                    </div>
                    <button onClick={savePasteSlip} style={{ ...btnPrimary, width: "100%" }}>💾 Save to tracker</button>
                  </section>
                )}

                <section style={panel}>
                  <div style={sectionTitle}>Each leg's win rate</div>
                  {pasteResults.map((r, i) => {
                    if (r.status !== "ok") {
                      const msg = r.status === "noplayer" ? "player not found" : r.status === "nologs" ? "no game logs" : r.status === "unparsed" ? "couldn't read this line" : "error";
                      return (
                        <div key={i} style={{ ...card, borderColor: "rgba(248,113,113,.3)" }}>
                          <div style={{ fontSize: 13 }}>{r.name || r.raw}</div>
                          <div style={{ fontSize: 11, color: "var(--red)" }}>⚠ {msg} — check spelling or analyze this one manually in Build.</div>
                        </div>
                      );
                    }
                    const col = r.p >= 0.6 ? "var(--green)" : r.p <= 0.45 ? "var(--red)" : "var(--amber)";
                    return (
                      <div key={i} style={{ ...card }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{r.player.name}</div>
                            <div style={{ fontSize: 12, color: "var(--mut)" }}>{STAT_TYPES[r.stat].label} {r.side === "over" ? "Over" : "Under"} {r.line}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: col, fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(r.p)}</div>
                            <div style={{ fontSize: 10, color: "var(--mut)" }}>hit {r.hits}/{r.n} games</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {r.vals.map((v, j) => <Chip key={j} val={v} hit={r.side === "over" ? v > r.line : v < r.line} />)}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 11, color: "var(--mut)" }}>Win rates use your "{window_} games" setting, shrunk toward 50% so small samples don't overclaim. Weakest leg drags the whole parlay.</div>
                </section>
              </>
            )}
          </>
        )}

        {tab === "tracker" && (
          <>
            <section style={panel}>
              <div style={sectionTitle}>My Record</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                <div style={miniStat}><div style={miniLbl}>Won</div><div style={{ ...miniVal, color: "var(--green)" }}>{record.won}</div></div>
                <div style={miniStat}><div style={miniLbl}>Lost</div><div style={{ ...miniVal, color: "var(--red)" }}>{record.lost}</div></div>
                <div style={miniStat}><div style={miniLbl}>Net profit</div><div style={{ ...miniVal, color: record.profit >= 0 ? "var(--green)" : "var(--red)" }}>{record.profit >= 0 ? "+" : "−"}{fmtCash(record.profit, sym)}</div></div>
              </div>
              {tracked.length > 0 && record.won + record.lost > 0 && (
                <div style={{ fontSize: 12, color: "var(--mut)" }}>
                  Win rate: <b style={{ color: "var(--tx)" }}>{fmtPct(record.won / (record.won + record.lost))}</b> over {record.won + record.lost} settled bets.
                  {record.pending > 0 && ` ${record.pending} still pending.`}
                </div>
              )}
            </section>
            <section style={panel}>
              <div style={sectionTitle}>Bet History</div>
              {tracked.length === 0 && <div style={{ color: "var(--mut)", fontSize: 13 }}>No saved bets yet. Build or paste a parlay, then tap "Save to tracker".</div>}
              {tracked.map(t => (
                <div key={t.id} style={{ ...card, borderColor: t.status === "won" ? "rgba(52,211,153,.4)" : t.status === "lost" ? "rgba(248,113,113,.4)" : "var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--mut)" }}>{t.date} · {t.legs.length} leg{t.legs.length > 1 ? "s" : ""} · {t.dec.toFixed(2)}x</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.status === "won" ? "var(--green)" : t.status === "lost" ? "var(--red)" : "var(--amber)" }}>
                      {t.status === "won" ? "WON ✓" : t.status === "lost" ? "LOST ✗" : "PENDING"}
                    </span>
                  </div>
                  {t.legs.map((l, i) => <div key={i} style={{ fontSize: 12 }}>• {l.name} {l.side === "over" ? "O" : "U"}{l.line} {l.stat} <span style={{ color: "var(--mut)" }}>({fmtPct(l.p)})</span></div>)}
                  <div style={{ fontSize: 12, color: "var(--mut)" }}>Bet {fmtCash(t.stake, sym)} → {t.status === "won" ? `won ${fmtCash(t.payout - t.stake, sym)}` : t.status === "lost" ? `lost ${fmtCash(t.stake, sym)}` : `to win ${fmtCash(t.payout - t.stake, sym)}`}</div>
                  {t.status === "pending" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => markBet(t.id, "won")} style={{ ...btnAmber, flex: 1, borderColor: "var(--green)", color: "var(--green)", background: "rgba(52,211,153,.1)" }}>✓ Won</button>
                      <button onClick={() => markBet(t.id, "lost")} style={{ ...btnAmber, flex: 1, borderColor: "var(--red)", color: "var(--red)", background: "rgba(248,113,113,.1)" }}>✗ Lost</button>
                      <button onClick={() => delBet(t.id)} style={bigClose}>🗑</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => markBet(t.id, "pending")} style={{ ...btnGhost, fontSize: 11 }}>↺ Undo</button>
                      <button onClick={() => delBet(t.id)} style={bigClose}>🗑 Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}

        {tab === "build" && (
          <>
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
                      <button style={{ ...btnGhost, flex: 1, fontSize: 11 }} onClick={() => loadRoster(g.awayId, g.away)}>Browse {g.away}</button>
                      <button style={{ ...btnGhost, flex: 1, fontSize: 11 }} onClick={() => loadRoster(g.homeId, g.home)}>Browse {g.home}</button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {(scanning || scanResults) && (
              <section id="scan-board" style={{ ...panel, border: "1px solid rgba(52,211,153,.3)" }}>
                <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--green)" }}>⭐ Strong bets — {scanLabel}</span>
                  {scanResults && <button onClick={() => setScanResults(null)} style={bigClose}>✕</button>}
                </div>
                {scanning && <div style={{ color: "var(--amber)", fontSize: 13 }}>Scanning roster… ~10-20s.</div>}
                {scanResults && scanResults.length === 0 && <div style={{ color: "var(--mut)", fontSize: 13 }}>No strong bets cleared the threshold. Try the other team.</div>}

                {scanResults && scanResults.length > 0 && (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => setScanGroup("all")} style={scanGroup === "all" ? pillOn : pillOff}>All ({scanResults.length})</button>
                      {availableGroups.map(g => {
                        const count = scanResults.filter(s => g.keys.includes(s.key)).length;
                        return <button key={g.label} onClick={() => setScanGroup(g.label)} style={scanGroup === g.label ? pillOn : pillOff}>{g.label} ({count})</button>;
                      })}
                    </div>
                    {/* HIT-RATE FILTER */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--mut)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Min hits:</span>
                      {[0, 6, 7, 8, 9, 10].map(h => (
                        <button key={h} onClick={() => setMinHits(h)} style={minHits === h ? pillSmOn : pillSmOff}>
                          {h === 0 ? "Any" : `${h}+`}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {groupedScan && groupedScan.length === 0 && scanResults.length > 0 && (
                  <div style={{ color: "var(--mut)", fontSize: 13 }}>None match this filter. Lower the min-hits or pick another stat.</div>
                )}

                {groupedScan && groupedScan.map((s) => {
                  const v = verdict(s.edge);
                  const sideLabel = s.side === "over" ? "Over" : "Under";
                  const rowKey = `${s.player.id}-${s.key}`;
                  const isOpen = openCheck === rowKey;
                  return (
                    <div key={rowKey} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <button onClick={() => setOpenCheck(isOpen ? null : rowKey)}
                          style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx)" }}>
                            {s.player.name} — <span style={{ color: s.side === "over" ? "var(--green)" : "var(--amber)" }}>{sideLabel} {s.line} {s.short}</span>
                            <span style={{ fontSize: 11, color: "var(--amber)", marginLeft: 6 }}>{isOpen ? "▲ check" : "▼ check 747"}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--mut)", fontFamily: "'IBM Plex Mono',monospace" }}>{sideLabel === "Over" ? "went over" : "stayed under"} {s.hits}/{s.n} · avg {s.avg.toFixed(1)}</div>
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: v.color, fontFamily: "'IBM Plex Mono',monospace" }}>{fmtPct(s.p)}</div>
                            <div style={{ fontSize: 9, color: v.color }}>{v.text}</div>
                          </div>
                          <button onClick={() => addLegFromScan(s)} disabled={slate.length >= 10} style={{ ...btnAmber, padding: "8px 12px", fontSize: 16 }}>+</button>
                        </div>
                      </div>
                      {isOpen && <InlineCheck item={s} window_={window_} defaultOdds={defaultOdds} onAdd={addFromInline} sym={sym} />}
                    </div>
                  );
                })}
                {scanResults && scanResults.length > 0 && <div style={{ fontSize: 11, color: "var(--mut)" }}>Tap any pick to check 747's exact line. App's own lines shown by default — confirm before betting.</div>}
              </section>
            )}

            <section style={panel}>
              <div style={sectionTitle}>Search any player</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={query} placeholder="e.g. Wembanyama" onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} style={{ ...inp, flex: 1 }} />
                <button onClick={() => search()} disabled={busy} style={btnPrimary}>{busy ? "…" : "Search"}</button>
              </div>
              {players.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--mut)" }}>{listLabel} — tap to analyze (list stays open)</span>
                    <button onClick={() => setPlayers([])} style={bigClose}>✕ Hide</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                    {players.map(p => (
                      <button key={p.id} onClick={() => pickPlayer(p)}
                        style={{ ...btnGhost, textAlign: "left", padding: "10px 12px",
                          borderColor: draft?.player?.id === p.id ? "var(--amber)" : "var(--line)",
                          background: draft?.player?.id === p.id ? "rgba(251,191,36,.08)" : "transparent" }}>
                        {p.name} <span style={{ color: "var(--mut)", fontSize: 11 }}>{p.team} {p.position}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && <div style={errStyle}>{error}</div>}
            </section>

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
                    <input type="number" step="0.5" value={bookLine} placeholder="e.g. 30" onChange={e => setBookLine(e.target.value)} style={{ ...inp, flex: 1 }} />
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

            {parlays.length > 0 && (
              <section style={panel}>
                <div style={sectionTitle}>Recommended Parlays</div>
                {parlays.map(pl => {
                  const { dec, adjP, ev } = priceParlay(pl.legs);
                  return (
                    <div key={pl.name} style={{ ...card, borderColor: ev >= 0 ? "rgba(52,211,153,.3)" : "var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 16, color: "var(--amber)" }}>{pl.emoji} {pl.name} — {pl.legs.length} legs</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: ev >= 0 ? "var(--green)" : "var(--red)" }}>{ev >= 0 ? "+EV ✓" : "−EV ✗"}</span>
                      </div>
                      {pl.legs.map((l, i) => <div key={i} style={{ fontSize: 12 }}>• {l.player.name} {STAT_TYPES[l.stat].label} {l.side === "over" ? "O" : "U"}{l.line} <span style={{ color: "var(--mut)" }}>({fmtPct(l.p)})</span></div>)}
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
          </>
        )}

        <footer style={{ fontSize: 11, color: "var(--mut)", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 8 }}>
          Real ESPN game logs. Estimates, not predictions. Match the app's line to 747's or the % means nothing. Bet only what you can afford to lose.
        </footer>
      </div>

      {legs.length > 0 && tab === "build" && (
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
                <button onClick={() => setSlate([])} style={bigClose}>Clear all</button>
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
                  <button onClick={saveBet} style={{ ...btnPrimary, width: "100%" }}>💾 Save to tracker</button>
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
const tabOn = { flex: 1, background: "var(--amber)", color: "#0a0e14", border: "none", borderRadius: 6, padding: "8px 4px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Oswald,sans-serif" };
const tabOff = { flex: 1, background: "transparent", color: "var(--mut)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 4px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "Oswald,sans-serif" };
const pillOn = { background: "var(--green)", color: "#0a0e14", border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const pillOff = { background: "transparent", color: "var(--mut)", border: "1px solid var(--line)", borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer" };
const pillSmOn = { background: "var(--amber)", color: "#0a0e14", border: "none", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const pillSmOff = { background: "transparent", color: "var(--mut)", border: "1px solid var(--line)", borderRadius: 20, padding: "4px 10px", fontSize: 11, cursor: "pointer" };
const panel = { background: "#11161f", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 };
const card = { background: "rgba(0,0,0,.2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const sectionTitle = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" };
const errStyle = { color: "var(--red)", fontSize: 12, background: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 6, padding: "8px 12px" };
const sideBox = { background: "rgba(0,0,0,.3)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 };
const miniStat = { background: "rgba(0,0,0,.3)", borderRadius: 6, padding: "8px 10px", textAlign: "center" };
const miniLbl = { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--mut)" };
const miniVal = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: "var(--tx)", marginTop: 2 };
