"use client";
import { useState, useMemo } from "react";
import {
  STAT_TYPES, americanToDecimal, impliedProb,
  weightedShrunkProb, kellyStake, priceParlay, recommendParlays,
} from "../lib/engine";

const fmtPct = (x, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const fmtMoney = (x) => x.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function SegBar({ p }) {
  const segs = 24;
  const lit = Math.round(p * segs);
  return (
    <div className="segbar">
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} className={`seg ${i < lit ? (p >= 0.55 ? "g" : p <= 0.45 ? "r" : "a") : ""}`} />
      ))}
    </div>
  );
}

export default function PropDesk() {
  const [bankroll, setBankroll] = useState(10000);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [props, setProps] = useState([]); // built prop legs
  const [draft, setDraft] = useState(null); // {player, logs, stat, line, side, odds, window}

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/player?q=${encodeURIComponent(query)}`);
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
      if (!d.logs.length) throw new Error("No game logs found for this season.");
      setDraft({ player: p, logs: d.logs, stat: "pts", line: 20.5, side: "over", odds: -110, window: 10 });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const addProp = () => {
    setProps([...props, { ...draft, id: Date.now() }]);
    setDraft(null); setQuery("");
  };

  const legs = useMemo(() => props.map((pr) => {
    const vals = pr.logs.slice(0, pr.window).map(STAT_TYPES[pr.stat].calc);
    const { p, hits, n } = weightedShrunkProb(vals, pr.line, pr.side);
    const edge = p - impliedProb(pr.odds);
    return {
      id: pr.id, player: pr.player.name, stat: STAT_TYPES[pr.stat].label,
      side: pr.side, line: pr.line, odds: pr.odds, p, hits, n, edge, vals,
      gameKey: pr.player.team, // legs from same team treated as correlated
    };
  }), [props]);

  const parlays = useMemo(() => recommendParlays(legs), [legs]);

  const draftVals = draft ? draft.logs.slice(0, draft.window).map(STAT_TYPES[draft.stat].calc) : [];
  const draftProb = draft ? weightedShrunkProb(draftVals, draft.line, draft.side) : null;
  const draftEdge = draft ? draftProb.p - impliedProb(draft.odds) : 0;

  return (
    <main className="wrap">
      <header>
        <div className="eyebrow">RISK DESK · REAL GAME LOGS, REAL MATH</div>
        <h1>PROP DESK</h1>
        <p className="sub">
          Probabilities are empirical hit rates from the player's actual last games, shrunk toward 50%
          (small samples don't earn big claims). Edge = your probability minus the break-even of your book's odds.
          Up to 10 legs. ¼-Kelly sizing, capped.
        </p>
      </header>

      <section className="panel">
        <label>Bankroll (USD)
          <input type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value) || 0)} />
        </label>
        <label>Add a player
          <div className="row">
            <input value={query} placeholder="e.g. Wembanyama" onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search} disabled={busy}>{busy ? "…" : "Search"}</button>
          </div>
        </label>
        {players.length > 0 && (
          <div className="results">
            {players.map((p) => (
              <button key={p.id} className="result" onClick={() => pickPlayer(p)}>
                {p.name} <span>{p.team} {p.position}</span>
              </button>
            ))}
          </div>
        )}
        {error && <div className="err">{error}</div>}
      </section>

      {draft && (
        <section className="panel draft">
          <h2>{draft.player.name} <span>{draft.player.team}</span></h2>
          <div className="grid4">
            <label>Stat
              <select value={draft.stat} onChange={(e) => setDraft({ ...draft, stat: e.target.value })}>
                {Object.entries(STAT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label>Line
              <input type="number" step="0.5" value={draft.line}
                onChange={(e) => setDraft({ ...draft, line: Number(e.target.value) })} />
            </label>
            <label>Side
              <select value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value })}>
                <option value="over">Over</option><option value="under">Under</option>
              </select>
            </label>
            <label>Odds (American)
              <input type="number" value={draft.odds}
                onChange={(e) => setDraft({ ...draft, odds: Number(e.target.value) || -110 })} />
            </label>
          </div>
          <label>Sample window — last {draft.window} games
            <input type="range" min="5" max="20" value={draft.window}
              onChange={(e) => setDraft({ ...draft, window: Number(e.target.value) })} />
          </label>
          <div className="logchips">
            {draftVals.map((v, i) => (
              <span key={i} className={`chip ${draft.side === "over" ? (v > draft.line ? "hit" : "miss") : (v < draft.line ? "hit" : "miss")}`}>{v}</span>
            ))}
          </div>
          <SegBar p={draftProb.p} />
          <div className="statline">
            <span>raw {draftProb.hits}/{draftProb.n}</span>
            <span>shrunk P {fmtPct(draftProb.p)}</span>
            <span>break-even {fmtPct(impliedProb(draft.odds))}</span>
            <span className={draftEdge >= 0 ? "pos" : "neg"}>edge {draftEdge >= 0 ? "+" : ""}{fmtPct(draftEdge)}</span>
          </div>
          <div className="statline">
            <span>¼-Kelly stake: <b>{fmtMoney(kellyStake(draftProb.p, americanToDecimal(draft.odds), bankroll))}</b></span>
          </div>
          <div className="row">
            <button className="primary" onClick={addProp} disabled={props.length >= 10}>
              {props.length >= 10 ? "10-leg limit reached" : "Add to slate"}
            </button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </section>
      )}

      {legs.length > 0 && (
        <section className="panel">
          <h2>Slate — {legs.length}/10 legs</h2>
          {legs.map((l) => (
            <div key={l.id} className="leg">
              <div>
                <b>{l.player}</b> {l.side} {l.line} {l.stat}
                <div className="mut">raw {l.hits}/{l.n} · P {fmtPct(l.p)} @ {l.odds} ·{" "}
                  <span className={l.edge >= 0 ? "pos" : "neg"}>edge {l.edge >= 0 ? "+" : ""}{fmtPct(l.edge)}</span>
                </div>
              </div>
              <button onClick={() => setProps(props.filter((x) => x.id !== l.id))}>✕</button>
            </div>
          ))}
        </section>
      )}

      {parlays.map((pl) => {
        const { dec, naiveP, adjP, ev, extraSameGame } = priceParlay(pl.legs);
        const stake = Math.min(0.01, Math.max(0, ev * 0.25)) * bankroll;
        return (
          <section key={pl.name} className="panel parlay">
            <h2>{pl.name} — {pl.legs.length} legs</h2>
            <div className="mut">{pl.note}</div>
            {pl.legs.map((l) => <div key={l.id} className="mut">{l.player} {l.side} {l.line} {l.stat} · {fmtPct(l.p)}</div>)}
            <SegBar p={adjP} />
            <div className="statline">
              <span>{dec.toFixed(1)}x</span>
              <span>hit P {fmtPct(adjP)}</span>
              <span>$100 → {fmtMoney(100 * dec)}</span>
              <span className={ev >= 0 ? "pos" : "neg"}>EV/$1 {ev >= 0 ? "+" : ""}{ev.toFixed(3)}</span>
            </div>
            <div className="mut">
              Over 100 plays at $100: ~{Math.round(adjP * 100)} hits → expected {fmtMoney((adjP * (dec - 1) - (1 - adjP)) * 100 * 100)}.
              {extraSameGame > 0 && " Same-team legs detected — correlation haircut applied."}
              {" "}Suggested stake: {stake > 0 ? fmtMoney(stake) : "$0 (negative EV — skip)"}.
            </div>
          </section>
        );
      })}

      {legs.length >= 2 && parlays.length === 0 && (
        <section className="panel mut">
          No parlay recommended — fewer than two legs show positive edge at your entered odds. That's the system working.
        </section>
      )}

      <footer className="mut">
        Empirical hit rates ≠ true probabilities; books set lines at medians, so most streaks are line placement, not edge.
        Bet only what survives being wrong.
      </footer>
    </main>
  );
}
