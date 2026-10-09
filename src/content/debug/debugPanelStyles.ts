// Styles for the debug panel's shadow root. Dark frosted glass, system UI font
// for labels and a monospace face for numbers; short, springy animations that
// switch off under prefers-reduced-motion.

export const DEBUG_PANEL_STYLES = `
  :host {
    all: initial;
    --bg: rgba(14, 16, 24, 0.9);
    --surface: rgba(255, 255, 255, 0.04);
    --surface-hover: rgba(255, 255, 255, 0.07);
    --border: rgba(255, 255, 255, 0.08);
    --text: #e8eaf0;
    --dim: #9aa3b5;
    --faint: #5d6678;
    --accent: #a78bfa;
    --accent-2: #38bdf8;
    --good: #34d399;
    --warn: #fbbf24;
    --bad: #fb7185;
    --spring: cubic-bezier(0.2, 0.9, 0.25, 1.15);
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }

  /* ---------- Shell ---------- */
  .panel, .dock {
    position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
    font: 12px/1.45 var(--sans); color: var(--text);
  }
  .panel {
    width: 500px; height: min(620px, 72vh); min-width: 360px; min-height: 280px;
    display: flex; flex-direction: column; overflow: hidden; resize: both;
    background: var(--bg);
    backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%);
    border: 1px solid var(--border); border-radius: 16px;
    box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    animation: panel-in 320ms var(--ease) both;
  }
  @keyframes panel-in {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to { opacity: 1; transform: none; }
  }

  header {
    display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px 14px;
    cursor: grab; user-select: none; touch-action: none;
  }
  header:active { cursor: grabbing; }
  .title { font-weight: 650; letter-spacing: -0.01em; font-size: 13px; }
  .badge {
    font: 600 10px/1 var(--sans); letter-spacing: 0.06em; text-transform: uppercase;
    padding: 4px 7px; border-radius: 999px; color: #0b0d14;
    background: linear-gradient(120deg, var(--accent), var(--accent-2));
  }
  .spacer { flex: 1; }
  button { all: unset; cursor: pointer; font: inherit; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
  .icon {
    width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px;
    color: var(--dim); font-size: 13px; transition: background 150ms, color 150ms, transform 150ms var(--spring);
  }
  .icon:hover { background: var(--surface-hover); color: var(--text); }
  .icon:active { transform: scale(0.9); }

  /* ---------- Status orb ---------- */
  .orb { position: relative; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: var(--faint); }
  .orb-playing { background: var(--good); }
  .orb-playing::after {
    content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--good);
    animation: ripple 1.6s var(--ease) infinite;
  }
  .orb-busy { background: var(--warn); animation: breathe 1.4s ease-in-out infinite; }
  @keyframes ripple { from { transform: scale(1); opacity: 0.6; } to { transform: scale(3); opacity: 0; } }
  @keyframes breathe { 50% { opacity: 0.35; } }

  /* ---------- Overview ---------- */
  .overview { padding: 0 12px 10px; display: flex; flex-direction: column; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font: 500 10.5px/1 var(--sans); padding: 4px 8px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border); color: var(--dim);
    animation: pop 260ms var(--spring) both;
  }
  .chip-playing { color: var(--good); border-color: rgba(52, 211, 153, 0.35); background: rgba(52, 211, 153, 0.1); }
  .chip-streaming, .chip-loading { color: var(--warn); border-color: rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.08); }
  .chip-finished { color: var(--accent-2); border-color: rgba(56, 189, 248, 0.35); }
  .chip-closed { color: var(--bad); }
  .chip-id { margin-left: auto; font-family: var(--mono); color: var(--faint); animation: none; }
  .chip-source { color: var(--accent); border-color: rgba(167, 139, 250, 0.35); animation: none; }

  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .card {
    padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border);
    transition: border-color 200ms, background 200ms;
  }
  .card:hover { border-color: rgba(255, 255, 255, 0.14); }
  .card-wide { grid-column: 1 / -1; }
  .card-label { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--faint); }
  .card-value { margin-top: 2px; font: 600 20px/1.2 var(--mono); letter-spacing: -0.02em; transition: color 300ms; }
  .card-of { font-size: 13px; color: var(--faint); font-weight: 500; }
  .card-hint { font-size: 11px; color: var(--faint); }
  .card-value.good { color: var(--good); }
  .card-value.warn { color: var(--warn); }
  .card-value.bad { color: var(--bad); }
  .muted { color: var(--faint); }
  .tag {
    font: 600 9.5px/1 var(--sans); letter-spacing: 0.04em; padding: 3px 6px; border-radius: 6px;
    color: var(--dim); background: rgba(255, 255, 255, 0.06); text-transform: none;
  }
  .tag-good { color: var(--good); background: rgba(52, 211, 153, 0.12); }

  .progress, .meter { position: relative; height: 6px; margin-top: 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); overflow: hidden; }
  .progress span { position: absolute; inset: 0 auto 0 0; border-radius: 999px; transition: width 450ms var(--ease); }
  .progress-generated { background: rgba(56, 189, 248, 0.35); }
  .progress-played { background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
  .meter-fill { position: absolute; inset: 0; transform-origin: left; border-radius: 999px; transition: transform 450ms var(--ease), background 300ms; }
  .meter-fill.good { background: var(--good); }
  .meter-fill.warn { background: var(--warn); }
  .meter-fill.bad { background: var(--bad); }

  .stack-bar { display: flex; gap: 2px; height: 8px; margin-top: 8px; border-radius: 999px; overflow: hidden; }
  .stack-bar .seg { min-width: 3px; transform-origin: left; animation: grow 600ms var(--ease) both; }
  .stack-bar .seg:nth-child(2) { animation-delay: 40ms; }
  .stack-bar .seg:nth-child(3) { animation-delay: 80ms; }
  .stack-bar .seg:nth-child(4) { animation-delay: 120ms; }
  .stack-bar .seg:nth-child(n + 5) { animation-delay: 160ms; }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .seg-0 { background: #94a3b8; } .seg-1 { background: #f472b6; } .seg-2 { background: #fbbf24; } .seg-3 { background: #a78bfa; }
  .seg-4 { background: #2dd4bf; } .seg-5 { background: #38bdf8; } .seg-6 { background: #fb923c; } .seg-7 { background: #34d399; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font: 10.5px/1.3 var(--mono); color: var(--dim); }
  .legend i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 5px; }

  /* ---------- Tabs ---------- */
  .tabs {
    position: relative; display: grid; grid-template-columns: repeat(3, 1fr);
    margin: 0 12px 8px; padding: 3px; border-radius: 10px; background: rgba(255, 255, 255, 0.05);
  }
  .tab-indicator {
    position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3);
    border-radius: 8px; background: rgba(255, 255, 255, 0.1); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transform: translateX(calc(var(--tab-index) * 100%)); transition: transform 280ms var(--spring);
  }
  .tabs button {
    position: relative; text-align: center; padding: 6px 0; border-radius: 8px;
    font-weight: 550; color: var(--dim); transition: color 200ms;
  }
  .tabs button:hover, .tabs button.active { color: var(--text); }

  .tab-body { flex: 1; min-height: 0; display: flex; flex-direction: column; animation: content-in 220ms var(--ease) both; }
  @keyframes content-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 10px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.15) transparent; }
  .empty { margin: auto; padding: 24px; color: var(--faint); text-align: center; }

  /* ---------- Sentences ---------- */
  .sentence {
    position: relative; display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 8px; cursor: pointer;
    transition: background 180ms, color 180ms;
  }
  .sentence:hover { background: var(--surface-hover); }
  .sentence::before {
    content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 3px;
    background: linear-gradient(var(--accent), var(--accent-2)); transform: scaleY(0); transition: transform 250ms var(--spring);
  }
  .sentence.is-playing { background: linear-gradient(90deg, rgba(167, 139, 250, 0.16), rgba(56, 189, 248, 0.06)); }
  .sentence.is-playing::before { transform: scaleY(1); }
  .sentence.is-waiting .text, .sentence.is-generating .text { color: var(--faint); }
  .sentence.is-played .text { color: var(--dim); }
  .sentence.is-failed .text { color: var(--bad); }
  .num { width: 26px; flex-shrink: 0; text-align: right; font: 10.5px/1 var(--mono); color: var(--faint); }
  .text { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .quote-mark { color: var(--accent); margin-right: 4px; }
  .meta { flex-shrink: 0; width: 52px; text-align: right; font: 10.5px/1 var(--mono); color: var(--faint); }
  .warn-tag { flex-shrink: 0; font: 600 9.5px/1 var(--sans); padding: 3px 5px; border-radius: 5px; color: var(--bad); background: rgba(251, 113, 133, 0.12); }

  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin: 0 3px; animation: pop 320ms var(--spring) both; }
  .dot-waiting { background: transparent; box-shadow: inset 0 0 0 1.5px var(--faint); animation: none; }
  .dot-generating { background: var(--warn); animation: pop 320ms var(--spring) both, breathe 1s ease-in-out 320ms infinite; }
  .dot-ready { background: var(--accent-2); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15); }
  .dot-played { background: var(--faint); }
  .dot-failed { background: var(--bad); box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.18); }
  @keyframes pop { 0% { transform: scale(0.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

  .eq { display: inline-flex; align-items: flex-end; gap: 2px; width: 14px; height: 11px; flex-shrink: 0; }
  .eq i { flex: 1; border-radius: 1px; background: var(--good); animation: eq 900ms ease-in-out infinite; }
  .eq i:nth-child(2) { animation-delay: -300ms; }
  .eq i:nth-child(3) { animation-delay: -600ms; }
  @keyframes eq { 0%, 100% { height: 30%; } 50% { height: 100%; } }

  /* ---------- Events ---------- */
  .timeline { position: relative; padding-left: 10px; }
  .event {
    position: relative; display: grid; grid-template-columns: 52px 14px auto 1fr; align-items: center; gap: 6px;
    padding: 3px 4px; border-radius: 6px; animation: event-in 260ms var(--ease) both;
  }
  .event:hover { background: var(--surface); }
  @keyframes event-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
  .event-time { font: 10.5px/1 var(--mono); color: var(--faint); text-align: right; }
  .event-dot { justify-self: center; width: 7px; height: 7px; border-radius: 50%; background: var(--faint); box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.04); }
  .event-type { font-weight: 550; white-space: nowrap; }
  .event-detail { color: var(--dim); font: 11px/1.3 var(--mono); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .kind-sentence .event-dot { background: var(--accent-2); }
  .kind-progress .event-dot { background: var(--warn); }
  .kind-playing .event-dot { background: var(--good); }
  .kind-paused .event-dot { background: var(--dim); }
  .kind-timing .event-dot { background: #f472b6; }
  .kind-stream .event-dot { background: var(--accent); }
  .kind-model .event-dot { background: #fb923c; }
  .kind-audio .event-dot { background: rgba(56, 189, 248, 0.45); }
  .kind-audio .event-type { color: var(--dim); font-weight: 500; }
  .event-read {
    display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; color: var(--accent);
    font: 600 10.5px/1 var(--sans); letter-spacing: 0.05em; text-transform: uppercase;
    animation: event-in 260ms var(--ease) both;
  }
  .event-read::before, .event-read::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.4), transparent); }

  /* ---------- Config ---------- */
  .config { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; }
  .panel-card { padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
  h4 { margin: 0 0 8px; font-size: 12px; font-weight: 650; letter-spacing: -0.005em; }
  .h4-dim { font-weight: 500; color: var(--faint); margin-left: 4px; font-size: 11px; }
  dl { display: grid; grid-template-columns: 64px 1fr; gap: 6px 10px; margin: 0; align-items: center; }
  dt { color: var(--faint); font-size: 11px; }
  dd { margin: 0; display: flex; align-items: center; gap: 8px; min-width: 0; }
  code { font: 11px/1.4 var(--mono); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ghost {
    margin-left: auto; padding: 3px 9px; border-radius: 7px; font-weight: 600; font-size: 11px; color: var(--accent);
    background: rgba(167, 139, 250, 0.12); transition: background 150ms, transform 150ms var(--spring);
  }
  .ghost:hover { background: rgba(167, 139, 250, 0.22); }
  .ghost:active { transform: scale(0.94); }
  .empty-inline { color: var(--faint); }
  .rule { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px solid rgba(255, 255, 255, 0.04); min-width: 0; }
  .rule:first-of-type { border-top: none; }
  .count { width: 46px; flex-shrink: 0; text-align: right; font: 600 11px/1 var(--mono); color: var(--faint); }
  .rule-hit .count { color: var(--good); }
  .rule-off { opacity: 0.45; }
  .rule-bad .count, .rule-bad code { color: var(--bad); }
  .arrow { color: var(--faint); }
  .replacement { color: var(--dim); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .noise-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .noise {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 4px 4px 8px; border-radius: 8px;
    background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border);
  }
  .noise b { font: 600 10px/1 var(--mono); padding: 3px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.06); color: var(--dim); }
  .noise em { font-style: normal; font-size: 10px; color: var(--accent); }
  .noise-hit b { color: #0b0d14; background: var(--good); }
  .noise-off { opacity: 0.5; }
  .noise-bad { border-color: rgba(251, 113, 133, 0.4); }
  .noise-bad b, .noise-bad code { color: var(--bad); }

  /* ---------- Minimized ---------- */
  .pill {
    display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px 8px 12px; border-radius: 999px;
    background: var(--bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border); box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.5);
    font: 600 12px/1 var(--mono); color: var(--text);
    animation: panel-in 280ms var(--spring) both; transition: transform 150ms var(--spring);
  }
  .pill:hover { transform: translateY(-1px); }
  .pill-dim { color: var(--faint); font-weight: 500; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;
