// Shadow DOM styles for the floating player, the selection "Read" button and
// the settings panel.
//
// Colours are design tokens (--u-*) set on each root element (.kokoro-btn,
// .kokoro-pill, .settings-panel) and swapped by .theme-light, so components
// only use the tokens. Accent is the violet → sky gradient shared with the
// debug panel. Animations are short and springy and switch off under
// prefers-reduced-motion.

export const SHADOW_STYLES = `
  * { box-sizing: border-box; }

  /* ---------- Tokens ---------- */
  .kokoro-btn, .kokoro-pill, .settings-panel {
    --u-bg: rgba(17, 19, 28, 0.9);
    --u-bg-solid: #14161f;
    --u-surface: rgba(255, 255, 255, 0.05);
    --u-surface-hover: rgba(255, 255, 255, 0.09);
    --u-border: rgba(255, 255, 255, 0.09);
    --u-border-strong: rgba(255, 255, 255, 0.16);
    --u-text: #eef0f5;
    --u-dim: #a3abbd;
    --u-faint: #697284;
    --u-accent: #8b5cf6;
    --u-accent-2: #38bdf8;
    --u-accent-soft: rgba(139, 92, 246, 0.16);
    --u-grad: linear-gradient(135deg, #8b5cf6, #38bdf8);
    --u-on-accent: #ffffff;
    --u-good: #34d399;
    --u-warn: #fbbf24;
    --u-bad: #fb7185;
    --u-track: rgba(255, 255, 255, 0.12);
    --u-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.25);
    --u-spring: cubic-bezier(0.2, 0.9, 0.25, 1.2);
    --u-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --u-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --u-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-family: var(--u-sans);
    color: var(--u-text);
    -webkit-font-smoothing: antialiased;
  }
  .theme-light {
    --u-bg: rgba(255, 255, 255, 0.94);
    --u-bg-solid: #ffffff;
    --u-surface: rgba(15, 23, 42, 0.04);
    --u-surface-hover: rgba(15, 23, 42, 0.07);
    --u-border: rgba(15, 23, 42, 0.09);
    --u-border-strong: rgba(15, 23, 42, 0.18);
    --u-text: #0f172a;
    --u-dim: #475569;
    --u-faint: #94a3b8;
    --u-accent-soft: rgba(139, 92, 246, 0.1);
    --u-good: #059669;
    --u-warn: #d97706;
    --u-bad: #e11d48;
    --u-track: rgba(15, 23, 42, 0.1);
    --u-shadow: 0 16px 40px -14px rgba(15, 23, 42, 0.28), 0 2px 6px rgba(15, 23, 42, 0.08);
  }

  button, input, select { font-family: inherit; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid var(--u-accent); outline-offset: 2px;
  }

  /* ---------- Selection "Read" button ---------- */
  .kokoro-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 14px 7px 11px;
    background: var(--u-bg); border: 1px solid var(--u-border); border-radius: 999px;
    backdrop-filter: blur(14px) saturate(150%); -webkit-backdrop-filter: blur(14px) saturate(150%);
    font-size: 13px; font-weight: 600; letter-spacing: -0.005em;
    cursor: pointer; box-shadow: var(--u-shadow);
    animation: readit-pop-up 260ms var(--u-spring) both;
    transition: border-color 160ms, background 160ms;
  }
  .kokoro-btn svg { color: var(--u-accent); }
  .theme-light.kokoro-btn svg { color: #7c3aed; }
  .kokoro-btn:hover { border-color: var(--u-border-strong); background: var(--u-bg-solid); }
  .kokoro-btn:active { filter: brightness(0.95); }
  .kokoro-btn:disabled { opacity: 0.7; cursor: progress; }
  /* The inline transform positions the button, so the entrance animates the
     individual translate/scale properties instead of transform. */
  @keyframes readit-pop-up {
    from { opacity: 0; scale: 0.85; translate: 0 6px; }
    to { opacity: 1; scale: 1; translate: 0 0; }
  }

  /* ---------- Floating player ---------- */
  .kokoro-pill {
    display: flex; align-items: center; gap: 8px;
    height: 46px; padding: 4px 8px 4px 5px;
    background: var(--u-bg); border: 1px solid var(--u-border); border-radius: 999px;
    backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
    font-size: 13px; box-shadow: var(--u-shadow);
    user-select: none; cursor: grab;
    animation: readit-pill-in 340ms var(--u-spring) both;
    transition: box-shadow 400ms var(--u-ease), border-color 400ms;
  }
  .kokoro-pill:active { cursor: grabbing; }
  .kokoro-pill.pill-playing {
    border-color: rgba(139, 92, 246, 0.35);
    box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.08), 0 10px 32px -8px rgba(139, 92, 246, 0.45), var(--u-shadow);
  }
  @keyframes readit-pill-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.94); }
    to { opacity: 1; transform: none; }
  }

  .pill-play-wrapper {
    position: relative; width: 38px; height: 38px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .pill-play-wrapper > svg { position: absolute; inset: 0; }
  .ring-track { stroke: var(--u-track); }
  .progress-ring-fill { transition: stroke-dashoffset 400ms var(--u-ease); }
  .pill-play-btn {
    position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; padding: 0;
    translate: -50% -50%;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 999px; cursor: pointer;
    background: var(--u-grad); color: var(--u-on-accent);
    box-shadow: 0 4px 12px -2px rgba(139, 92, 246, 0.55);
    transition: scale 180ms var(--u-spring), box-shadow 180ms, filter 180ms;
  }
  .pill-play-btn:hover { scale: 1.08; box-shadow: 0 6px 16px -2px rgba(139, 92, 246, 0.7); }
  .pill-play-btn:active { scale: 0.92; }
  .pill-play-btn:disabled { cursor: progress; filter: saturate(0.4); opacity: 0.6; scale: 1; }
  .pill-play-btn svg { animation: readit-icon-in 220ms var(--u-spring) both; }
  @keyframes readit-icon-in { from { opacity: 0; scale: 0.4; rotate: -30deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
  .pill-restart-btn { background: var(--u-good); box-shadow: 0 4px 12px -2px rgba(52, 211, 153, 0.5); }

  .pill-eq { display: inline-flex; align-items: flex-end; gap: 2px; width: 12px; height: 12px; flex-shrink: 0; }
  .pill-eq i { flex: 1; border-radius: 1px; background: var(--u-grad); animation: readit-eq 900ms ease-in-out infinite; }
  .pill-eq i:nth-child(2) { animation-delay: -300ms; }
  .pill-eq i:nth-child(3) { animation-delay: -600ms; }
  @keyframes readit-eq { 0%, 100% { height: 25%; } 50% { height: 100%; } }

  .pill-time {
    display: flex; align-items: center; gap: 3px;
    font: 500 12.5px/1 var(--u-mono); font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .pill-elapsed { color: var(--u-text); }
  .pill-time-sep { color: var(--u-faint); }
  .pill-total-time { color: var(--u-dim); }
  .pill-total-loading { animation: readit-breathe 1.5s ease-in-out infinite; }
  @keyframes readit-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .pill-error { color: var(--u-bad); font-family: var(--u-sans); font-weight: 600; cursor: help; animation: readit-shake 400ms var(--u-ease); }
  @keyframes readit-shake { 20%, 60% { translate: -2px 0; } 40%, 80% { translate: 2px 0; } }

  .pill-speed {
    min-width: 40px; padding: 5px 7px; border: none; border-radius: 8px; cursor: pointer;
    background: var(--u-surface); color: var(--u-dim);
    font: 600 11.5px/1 var(--u-mono); text-align: center;
    transition: background 160ms, color 160ms, scale 160ms var(--u-spring);
  }
  .pill-speed:hover { background: var(--u-surface-hover); color: var(--u-text); }
  .pill-speed:active { scale: 0.92; }
  .pill-speed span { display: inline-block; animation: readit-flip-in 240ms var(--u-spring) both; }
  @keyframes readit-flip-in { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }

  .pill-icon-btn {
    width: 28px; height: 28px; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 999px; cursor: pointer; text-decoration: none;
    background: transparent; color: var(--u-dim);
    transition: background 160ms, color 160ms, scale 160ms var(--u-spring);
  }
  .pill-icon-btn:hover { background: var(--u-surface-hover); color: var(--u-text); }
  .pill-icon-btn:active { scale: 0.9; }
  .pill-cog svg { transition: rotate 400ms var(--u-spring); }
  .pill-cog.active { color: var(--u-accent); background: var(--u-accent-soft); }
  .pill-cog.active svg { rotate: 90deg; }
  .pill-close:hover { color: var(--u-bad); }
  .pill-bmc {
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 28px; height: 28px; border-radius: 999px;
    color: #f5c400; text-decoration: none;
    transition: background 160ms, scale 160ms var(--u-spring), rotate 300ms var(--u-spring);
  }
  .pill-bmc:hover { background: rgba(245, 196, 0, 0.12); rotate: -10deg; }

  /* ---------- Settings panel ---------- */
  .settings-panel {
    width: 300px; max-height: min(640px, calc(100vh - 80px));
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--u-bg); border: 1px solid var(--u-border); border-radius: 18px;
    backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%);
    box-shadow: var(--u-shadow); font-size: 13px;
    opacity: 0; transform: translateY(-8px) scale(0.97); transform-origin: top right;
    pointer-events: none;
    transition: opacity 180ms var(--u-ease), transform 260ms var(--u-spring);
  }
  .settings-panel.visible { opacity: 1; transform: none; pointer-events: auto; }
  .settings-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 10px 18px; }
  .settings-title { font-size: 15px; font-weight: 700; letter-spacing: -0.015em; }
  .settings-close-btn {
    width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 999px; background: var(--u-surface); color: var(--u-dim); cursor: pointer;
    transition: background 160ms, color 160ms, rotate 300ms var(--u-spring);
  }
  .settings-close-btn:hover { background: var(--u-surface-hover); color: var(--u-text); rotate: 90deg; }

  .settings-tabs {
    display: flex; gap: 2px; margin: 0 14px 6px; padding: 3px;
    border-radius: 11px; background: var(--u-surface);
  }
  .settings-tab {
    display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0;
    padding: 6px 12px; border: none; border-radius: 8px; cursor: pointer;
    background: transparent; color: var(--u-dim); font-size: 12px; font-weight: 600; white-space: nowrap;
    transition: background 220ms var(--u-ease), color 160ms, box-shadow 220ms;
  }
  .settings-tab.tab-domain { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  .settings-tab:hover { color: var(--u-text); }
  .settings-tab.active { background: var(--u-bg-solid); color: var(--u-text); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
  .settings-tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--u-grad); flex-shrink: 0; animation: readit-pop 300ms var(--u-spring) both; }

  .settings-body {
    display: flex; flex-direction: column; gap: 8px; padding: 8px 18px 16px;
    overflow-y: auto; min-height: 0;
    scrollbar-width: thin; scrollbar-color: var(--u-border-strong) transparent;
    animation: readit-fade-up 260ms var(--u-ease) both;
  }
  @keyframes readit-fade-up { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
  /* Inside the scrolling body, scrollable children (voice list, rule list)
     would otherwise shrink to nothing instead of the body scrolling */
  .settings-body > * { flex-shrink: 0; }
  .settings-label {
    margin-top: 6px; font-size: 10.5px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--u-faint);
  }
  .settings-toggle-row .settings-label {
    margin-top: 0; font-size: 13px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--u-text);
  }

  .settings-select, .settings-selector-input, .settings-rule-input {
    background: var(--u-surface); color: var(--u-text); border: 1px solid var(--u-border); outline: none;
    transition: border-color 160ms, background 160ms, box-shadow 160ms;
  }
  .settings-select:hover, .settings-selector-input:hover, .settings-rule-input:hover { border-color: var(--u-border-strong); }
  .settings-select:focus, .settings-selector-input:focus, .settings-rule-input:focus {
    border-color: var(--u-accent); box-shadow: 0 0 0 3px var(--u-accent-soft);
  }
  .settings-select { width: 100%; padding: 8px 10px; border-radius: 10px; font-size: 12.5px; cursor: pointer; }
  .settings-select option { background: var(--u-bg-solid); color: var(--u-text); }

  .settings-range {
    width: 100%; height: 6px; margin: 6px 0 2px; border-radius: 999px; outline: none; cursor: pointer;
    -webkit-appearance: none; appearance: none; background: var(--u-track);
    background-image: var(--u-grad); background-repeat: no-repeat;
    background-size: calc((var(--range-value, 0.29)) * 100%) 100%;
  }
  .settings-range::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
    background: #ffffff; border: none; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35), 0 0 0 4px var(--u-accent-soft);
    transition: scale 160ms var(--u-spring), box-shadow 160ms;
  }
  .settings-range:hover::-webkit-slider-thumb, .settings-range:active::-webkit-slider-thumb {
    scale: 1.15; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35), 0 0 0 6px var(--u-accent-soft);
  }

  .settings-toggle-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin: 0 -8px; padding: 7px 8px; border-radius: 10px; transition: background 160ms;
  }
  .settings-toggle-row:hover { background: var(--u-surface); }
  .settings-toggle {
    position: relative; width: 38px; height: 22px; padding: 0; flex-shrink: 0;
    border: none; border-radius: 999px; cursor: pointer;
    background: var(--u-track); transition: background 260ms var(--u-ease);
  }
  .settings-toggle.active { background: var(--u-grad); }
  .settings-toggle-knob {
    position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
    background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 300ms var(--u-spring), width 160ms var(--u-ease);
  }
  .settings-toggle:active .settings-toggle-knob { width: 20px; }
  .settings-toggle.active .settings-toggle-knob { transform: translateX(16px); }
  .settings-toggle.active:active .settings-toggle-knob { transform: translateX(12px); }

  .settings-colors { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 4px; }
  .settings-color-btn {
    width: 24px; height: 24px; padding: 0; border-radius: 50%; cursor: pointer;
    border: 2px solid var(--u-bg-solid); box-shadow: 0 0 0 1px var(--u-border-strong);
    transition: scale 200ms var(--u-spring), box-shadow 200ms;
  }
  .settings-color-btn:hover { scale: 1.15; }
  .settings-color-btn.active { box-shadow: 0 0 0 2px var(--u-accent); scale: 1.1; }

  .settings-voice-list {
    max-height: 210px; overflow-y: auto; padding: 4px;
    border: 1px solid var(--u-border); border-radius: 12px; background: var(--u-bg-solid);
    scrollbar-width: thin; scrollbar-color: var(--u-border-strong) transparent;
  }
  .settings-voice-lang {
    position: sticky; top: -4px; z-index: 1; padding: 8px 8px 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--u-faint);
    background: var(--u-bg-solid);
  }
  .settings-voice-row {
    display: flex; align-items: center; justify-content: space-between; gap: 4px;
    padding: 4px 6px; border-radius: 8px; transition: background 140ms;
  }
  .settings-voice-row:hover { background: var(--u-surface-hover); }
  .settings-voice-check { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
  .settings-voice-check input[type="checkbox"] { width: 14px; height: 14px; margin: 0; accent-color: var(--u-accent); cursor: pointer; }
  .settings-voice-preview {
    width: 24px; height: 24px; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 999px; background: transparent; color: var(--u-dim); cursor: pointer;
    opacity: 0; transition: opacity 140ms, background 140ms, color 140ms, scale 160ms var(--u-spring);
  }
  .settings-voice-row:hover .settings-voice-preview, .settings-voice-preview:focus-visible, .settings-voice-preview:disabled { opacity: 1; }
  .settings-voice-preview:hover { background: var(--u-accent-soft); color: var(--u-accent); scale: 1.1; }
  .settings-voice-preview:disabled { cursor: progress; }
  .voice-status-icon { width: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .voice-cached-icon { display: flex; color: var(--u-good); animation: readit-pop 300ms var(--u-spring) both; }
  .voice-downloading-icon { display: flex; color: var(--u-warn); }

  .settings-reset-btn {
    width: 100%; padding: 9px 0; margin-top: 4px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--u-border); background: transparent; color: var(--u-dim); font-size: 12.5px; font-weight: 600;
    transition: background 160ms, color 160ms, border-color 160ms;
  }
  .settings-reset-btn:hover { background: var(--u-surface-hover); color: var(--u-text); border-color: var(--u-border-strong); }

  .settings-diagnostics {
    margin-top: 6px; padding: 10px 12px; border-radius: 12px;
    background: var(--u-surface); border: 1px solid var(--u-border);
  }
  .settings-diagnostics .settings-label { margin-top: 0; }
  .settings-diag-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; color: var(--u-dim); }
  .diag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--u-faint); }
  .diag-dot.ready { background: var(--u-good); box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18); }
  .diag-dot.downloading { background: var(--u-warn); animation: readit-breathe 1s ease-in-out infinite; }
  .diag-value { margin-left: auto; color: var(--u-faint); font: 11px/1.3 var(--u-mono); text-align: right; }

  .settings-content-selector { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
  .settings-selector-input {
    flex: 1; min-width: 0; padding: 7px 9px; border-radius: 9px; font: 11.5px/1.2 var(--u-mono);
  }
  .settings-selector-input::placeholder { color: var(--u-faint); }
  .settings-selector-input.selector-warn { border-color: var(--u-bad) !important; color: var(--u-bad); }
  .settings-selector-btn {
    width: 30px; height: 30px; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--u-border); border-radius: 9px; background: transparent; color: var(--u-dim); cursor: pointer;
    transition: background 160ms, color 160ms, border-color 160ms, scale 160ms var(--u-spring);
  }
  .settings-selector-btn:hover { background: var(--u-accent-soft); color: var(--u-accent); border-color: transparent; }
  .settings-selector-btn:active { scale: 0.92; }
  .selector-warning { padding: 0 2px; font-size: 11px; color: var(--u-bad); animation: readit-fade-up 200ms var(--u-ease) both; }

  .settings-rules-section { margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--u-border); }
  .settings-rules-toggle {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px 0; cursor: pointer;
    border: none; background: none; text-align: left; color: var(--u-text); font-size: 12.5px; font-weight: 600;
    transition: color 160ms;
  }
  .settings-rules-toggle:hover { color: var(--u-accent); }
  .settings-rules-chevron { font-size: 9px; line-height: 1; color: var(--u-faint); transition: rotate 260ms var(--u-spring); }
  .settings-rules-chevron.open { rotate: 90deg; }
  .settings-rules-list {
    display: flex; flex-direction: column; gap: 5px; max-height: 200px; margin-top: 8px; padding-right: 2px;
    overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--u-border-strong) transparent;
    animation: readit-fade-up 220ms var(--u-ease) both;
  }
  .settings-rule-row { display: flex; align-items: center; gap: 4px; }
  .settings-rule-input { flex: 1; min-width: 0; padding: 5px 7px; border-radius: 7px; font: 11px/1.2 var(--u-mono); }
  .settings-rule-input.rule-error { border-color: var(--u-bad) !important; box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.15); }
  .settings-rule-btn {
    width: 24px; height: 24px; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 7px; background: none; color: var(--u-faint); font-size: 11px; cursor: pointer;
    transition: background 140ms, color 140ms, scale 160ms var(--u-spring);
  }
  .settings-rule-btn:hover { background: var(--u-surface-hover); color: var(--u-text); }
  .settings-rule-btn:active { scale: 0.88; }
  .settings-rule-btn.rule-enabled { color: var(--u-good); }
  .settings-rule-btn.rule-disabled { color: var(--u-faint); }
  .settings-rule-add-btn, .settings-noise-add-btn {
    border: 1px dashed var(--u-border-strong); border-radius: 9px; background: none; color: var(--u-dim);
    font-size: 11.5px; font-weight: 600; cursor: pointer;
    transition: border-color 160ms, color 160ms, background 160ms;
  }
  .settings-rule-add-btn { display: block; width: 100%; padding: 7px; margin-top: 6px; }
  .settings-rule-add-btn:hover, .settings-noise-add-btn:hover { border-color: var(--u-accent); color: var(--u-accent); background: var(--u-accent-soft); }
  .settings-rule-reset-btn {
    display: block; width: 100%; padding: 5px; margin-top: 2px; border: none; background: none; cursor: pointer;
    color: var(--u-faint); font-size: 11px; text-align: center; transition: color 160ms;
  }
  .settings-rule-reset-btn:hover { color: var(--u-text); }

  .settings-noise-pills {
    display: flex; flex-wrap: wrap; gap: 5px; max-height: 150px; margin-top: 8px; padding-right: 2px;
    overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--u-border-strong) transparent;
  }
  .settings-noise-pill {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 5px 3px 9px;
    border: 1px solid var(--u-border); border-radius: 999px; background: var(--u-surface);
    font: 11px/1.4 var(--u-mono); color: var(--u-text); cursor: pointer;
    animation: readit-pop 240ms var(--u-spring) both;
    transition: border-color 160ms, background 160ms;
  }
  .settings-noise-pill:hover { border-color: rgba(139, 92, 246, 0.5); }
  .settings-noise-pill.active { border-color: var(--u-accent); background: var(--u-accent-soft); }
  .noise-pill-text { max-width: 170px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .noise-pill-remove {
    width: 16px; height: 16px; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 50%; background: none; color: var(--u-faint); font-size: 12px; line-height: 1; cursor: pointer;
    transition: background 140ms, color 140ms;
  }
  .noise-pill-remove:hover { color: var(--u-bad); background: rgba(251, 113, 133, 0.15); }
  .settings-noise-add { display: flex; gap: 6px; margin-top: 8px; }
  .settings-noise-add-btn { padding: 4px 10px; flex-shrink: 0; }
  .noise-match-count { margin-left: 1px; padding: 1px 5px; border-radius: 999px; font-size: 9.5px; color: var(--u-faint); }
  .noise-match-count.has-matches { color: var(--u-accent-2); background: rgba(56, 189, 248, 0.12); }

  @keyframes readit-pop { from { opacity: 0; scale: 0.6; } to { opacity: 1; scale: 1; } }
  @keyframes spin { to { rotate: 360deg; } }
  .spinner { animation: spin 0.9s linear infinite; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
    /* A loading spinner is information, not decoration: keep it turning */
    .spinner { animation-duration: 0.9s !important; animation-iteration-count: infinite !important; }
  }
`;
