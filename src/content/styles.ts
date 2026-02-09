// Shadow DOM styles for the floating player UI
// Extracted from index.tsx to keep the coordinator lean.

export const SHADOW_STYLES = `
  * {
    box-sizing: border-box;
  }
  .kokoro-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: #1f2937;
    color: white;
    border: none;
    border-radius: 9999px;
    font-size: 14px;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .kokoro-btn:hover {
    background: #374151;
  }
  .kokoro-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .kokoro-pill {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 40px;
    border-radius: 8px;
    gap: 8px;
    padding: 4px 12px;
    background: #111827;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    user-select: none;
    cursor: grab;
    transition: box-shadow 0.3s ease;
  }
  .kokoro-pill:active {
    cursor: grabbing;
  }
  .kokoro-pill.pill-playing {
    box-shadow: 0 0 16px 2px rgba(59,130,246,0.35), 0 4px 12px rgba(0,0,0,0.15);
  }
  .pill-play-wrapper {
    position: relative;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pill-play-wrapper > svg {
    position: absolute;
    top: 0;
    left: 0;
  }
  .progress-ring-fill {
    transition: stroke-dashoffset 0.3s ease;
  }
  .pill-play-btn {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 26px;
    height: 26px;
    border-radius: 9999px;
    background: white;
    color: #111827;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s ease;
  }
  .pill-play-btn:hover {
    background: #e5e7eb;
  }
  .pill-play-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pill-restart-btn {
    background: #3b82f6;
    color: white;
  }
  .pill-restart-btn:hover {
    background: #2563eb;
  }
  .pill-time {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pill-elapsed {
    color: #d1d5db;
  }
  .pill-time-sep {
    color: #4b5563;
  }
  .pill-total-time {
    color: #6b7280;
  }
  .pill-total-loading {
    animation: pulse-opacity 1.5s ease-in-out infinite;
  }
  @keyframes pulse-opacity {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .pill-speed {
    background: transparent;
    border: none;
    color: #9ca3af;
    font-size: 11px;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    padding: 2px 0;
    border-radius: 4px;
    min-width: 34px;
    text-align: center;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .pill-speed:hover {
    background: #374151;
    color: white;
  }
  .pill-icon-btn {
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    background: #1f2937;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: #6b7280;
    transition: color 0.15s ease, background 0.15s ease;
    text-decoration: none;
    flex-shrink: 0;
  }
  .pill-icon-btn:hover {
    color: white;
    background: #374151;
  }
  .pill-cog.active {
    color: white;
    animation: cog-spin 0.4s ease-out;
  }
  @keyframes cog-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(90deg); }
  }
  .pill-bmc {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFDD00;
    text-decoration: none;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }
  .pill-bmc:hover {
    color: #e6c700;
  }
  .settings-panel {
    width: 260px;
    background: #1f2937;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    color: #e5e7eb;
    overflow: hidden;
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  .settings-panel.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #374151;
  }
  .settings-title {
    font-weight: 600;
    font-size: 13px;
    color: white;
  }
  .settings-close-btn {
    background: transparent;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .settings-close-btn:hover {
    color: white;
  }
  .settings-body {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .settings-label {
    font-size: 11px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }
  .settings-select {
    width: 100%;
    padding: 6px 8px;
    background: #111827;
    color: #e5e7eb;
    border: 1px solid #374151;
    border-radius: 6px;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    outline: none;
  }
  .settings-select:focus {
    border-color: #3b82f6;
  }
  .settings-range {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #374151;
    border-radius: 2px;
    outline: none;
  }
  .settings-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
  }
  .settings-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  .settings-toggle {
    position: relative;
    width: 36px;
    height: 20px;
    background: #374151;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s ease;
  }
  .settings-toggle.active {
    background: #3b82f6;
  }
  .settings-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s ease;
  }
  .settings-toggle.active .settings-toggle-knob {
    transform: translateX(16px);
  }
  .settings-colors {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .settings-color-btn {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: border-color 0.15s ease;
  }
  .settings-color-btn:hover {
    border-color: #6b7280;
  }
  .settings-color-btn.active {
    border-color: white;
    box-shadow: 0 0 0 2px white;
  }
  /* ---- Light theme overrides ---- */
  .kokoro-btn.theme-light {
    background: #ffffff;
    color: #1f2937;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .kokoro-btn.theme-light:hover {
    background: #f3f4f6;
  }
  .kokoro-pill.theme-light {
    background: #ffffff;
    color: #1f2937;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }
  .kokoro-pill.theme-light.pill-playing {
    box-shadow: 0 0 16px 2px rgba(59,130,246,0.25), 0 4px 12px rgba(0,0,0,0.08);
  }
  .theme-light .pill-elapsed {
    color: #6b7280;
  }
  .theme-light .pill-time-sep {
    color: #d1d5db;
  }
  .theme-light .pill-play-btn {
    background: #1f2937;
    color: white;
  }
  .theme-light .pill-play-btn:hover {
    background: #374151;
  }
  .theme-light .pill-restart-btn {
    background: #3b82f6;
    color: white;
  }
  .theme-light .pill-restart-btn:hover {
    background: #2563eb;
  }
  .theme-light .pill-total-time {
    color: #9ca3af;
  }
  .theme-light .pill-speed {
    color: #6b7280;
  }
  .theme-light .pill-speed:hover {
    background: #f3f4f6;
    color: #1f2937;
  }
  .theme-light .pill-icon-btn {
    background: #f3f4f6;
    color: #6b7280;
  }
  .theme-light .pill-icon-btn:hover {
    color: #1f2937;
    background: #e5e7eb;
  }
  .settings-panel.theme-light {
    background: #ffffff;
    color: #374151;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  }
  .settings-panel.theme-light .settings-header {
    border-bottom-color: #e5e7eb;
  }
  .settings-panel.theme-light .settings-title {
    color: #111827;
  }
  .settings-panel.theme-light .settings-close-btn {
    color: #9ca3af;
  }
  .settings-panel.theme-light .settings-close-btn:hover {
    color: #374151;
  }
  .settings-panel.theme-light .settings-label {
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-select {
    background: #f9fafb;
    color: #374151;
    border-color: #d1d5db;
  }
  .settings-panel.theme-light .settings-select:focus {
    border-color: #3b82f6;
  }
  .settings-panel.theme-light .settings-range {
    background: #d1d5db;
  }
  .settings-panel.theme-light .settings-toggle {
    background: #d1d5db;
  }
  .settings-panel.theme-light .settings-toggle.active {
    background: #3b82f6;
  }
  .settings-panel.theme-light .settings-color-btn:hover {
    border-color: #9ca3af;
  }

  .settings-voice-list { max-height: 200px; overflow-y: auto; border: 1px solid #374151; border-radius: 6px; background: #111827; }
  .settings-voice-lang { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; padding: 6px 8px 2px; letter-spacing: 0.05em; position: sticky; top: 0; background: #111827; z-index: 1; }
  .settings-voice-row { display: flex; align-items: center; justify-content: space-between; padding: 3px 8px; }
  .settings-voice-row:hover { background: rgba(55, 65, 81, 0.5); }
  .settings-voice-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #e5e7eb; cursor: pointer; flex: 1; }
  .settings-voice-check input[type="checkbox"] { accent-color: #3b82f6; margin: 0; }
  .settings-voice-preview { width: 20px; height: 20px; border-radius: 50%; background: transparent; border: none; color: #6b7280; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }
  .settings-voice-preview:hover { color: white; background: #374151; }
  .settings-voice-preview:disabled { opacity: 0.5; cursor: not-allowed; }
  .settings-panel.theme-light .settings-voice-list { border-color: #d1d5db; background: #f9fafb; }
  .settings-panel.theme-light .settings-voice-lang { color: #6b7280; background: #f9fafb; }
  .settings-panel.theme-light .settings-voice-row:hover { background: rgba(229, 231, 235, 0.5); }
  .settings-panel.theme-light .settings-voice-check { color: #374151; }
  .settings-panel.theme-light .settings-voice-preview:hover { color: #1f2937; background: #e5e7eb; }

  .settings-tabs {
    display: flex;
    padding: 0 14px;
    gap: 0;
    border-bottom: 1px solid #374151;
  }
  .settings-tab {
    padding: 8px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #6b7280;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .settings-tab.tab-domain {
    flex: 1;
  }
  .settings-tab:hover {
    color: #d1d5db;
  }
  .settings-tab.active {
    color: white;
    border-bottom-color: #3b82f6;
  }
  .settings-tab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3b82f6;
    flex-shrink: 0;
  }
  .settings-reset-btn {
    width: 100%;
    padding: 7px 0;
    background: transparent;
    border: 1px solid #374151;
    border-radius: 6px;
    color: #9ca3af;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .settings-reset-btn:hover {
    background: #374151;
    color: white;
  }
  .voice-status-icon {
    width: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .voice-cached-icon {
    color: #4ade80;
    display: flex;
  }
  .voice-downloading-icon {
    color: #f59e0b;
    display: flex;
  }
  .settings-diagnostics {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid #374151;
  }
  .settings-diag-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    font-size: 11px;
    font-family: system-ui, -apple-system, sans-serif;
    color: #9ca3af;
  }
  .diag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6b7280;
    flex-shrink: 0;
  }
  .diag-dot.ready {
    background: #4ade80;
  }
  .diag-dot.downloading {
    background: #f59e0b;
  }
  .diag-value {
    margin-left: auto;
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-diagnostics {
    border-top-color: #e5e7eb;
  }
  .settings-panel.theme-light .settings-diag-row {
    color: #6b7280;
  }
  .settings-panel.theme-light .diag-value {
    color: #9ca3af;
  }
  .settings-panel.theme-light .voice-cached-icon {
    color: #16a34a;
  }
  .settings-panel.theme-light .voice-downloading-icon {
    color: #d97706;
  }
  .settings-panel.theme-light .settings-tabs {
    border-bottom-color: #e5e7eb;
  }
  .settings-panel.theme-light .settings-tab {
    color: #9ca3af;
  }
  .settings-panel.theme-light .settings-tab:hover {
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-tab.active {
    color: #111827;
    border-bottom-color: #3b82f6;
  }
  .settings-panel.theme-light .settings-reset-btn {
    border-color: #d1d5db;
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-reset-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }
  .settings-content-selector {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
  }
  .settings-selector-input {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    background: #111827;
    color: #e5e7eb;
    border: 1px solid #374151;
    border-radius: 4px;
    font-size: 11px;
    font-family: ui-monospace, monospace;
    outline: none;
  }
  .settings-selector-input:focus {
    border-color: #3b82f6;
  }
  .settings-selector-input::placeholder {
    color: #4b5563;
  }
  .settings-selector-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 1px solid #374151;
    border-radius: 4px;
    color: #9ca3af;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .settings-selector-btn:hover {
    background: #374151;
    color: white;
  }
  .settings-panel.theme-light .settings-selector-input {
    background: #f9fafb;
    color: #374151;
    border-color: #d1d5db;
  }
  .settings-panel.theme-light .settings-selector-input:focus {
    border-color: #3b82f6;
  }
  .settings-panel.theme-light .settings-selector-input::placeholder {
    color: #9ca3af;
  }
  .settings-panel.theme-light .settings-selector-btn {
    border-color: #d1d5db;
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-selector-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }
  .settings-selector-input.selector-warn {
    border-color: #ef4444 !important;
    color: #fca5a5;
  }
  .settings-panel.theme-light .settings-selector-input.selector-warn {
    border-color: #ef4444 !important;
    color: #dc2626;
  }
  .selector-warning {
    color: #fca5a5;
    font-size: 10px;
    margin-top: 2px;
    padding: 0 2px;
  }
  .settings-panel.theme-light .selector-warning {
    color: #dc2626;
  }

  .settings-rules-section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 8px;
    margin-top: 4px;
  }
  .settings-panel.theme-light .settings-rules-section {
    border-top-color: rgba(0, 0, 0, 0.08);
  }
  .settings-rules-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    background: none;
    border: none;
    color: #d1d5db;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 0;
    width: 100%;
    text-align: left;
  }
  .settings-panel.theme-light .settings-rules-toggle {
    color: #374151;
  }
  .settings-rules-toggle:hover {
    color: #f3f4f6;
  }
  .settings-panel.theme-light .settings-rules-toggle:hover {
    color: #111827;
  }
  .settings-rules-chevron {
    transition: transform 0.15s;
    font-size: 9px;
    line-height: 1;
  }
  .settings-rules-chevron.open {
    transform: rotate(90deg);
  }
  .settings-rules-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
    margin-top: 6px;
    padding-right: 2px;
  }
  .settings-rules-list::-webkit-scrollbar {
    width: 4px;
  }
  .settings-rules-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
  .settings-rule-row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding: 3px 0;
    border-left: 2px solid transparent;
    padding-left: 4px;
    transition: border-color 0.15s ease;
  }
  .settings-rule-row.rule-focused {
    border-left-color: #3b82f6;
  }
  .settings-rule-inputs {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .settings-rule-input-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .rule-match-count {
    font-size: 9px;
    color: #60a5fa;
    flex-shrink: 0;
    font-family: ui-monospace, monospace;
  }
  .settings-panel.theme-light .rule-match-count {
    color: #3b82f6;
  }
  .settings-rule-actions {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    align-items: center;
  }
  .settings-rule-actions .settings-rule-add-btn {
    flex: 1;
    margin-top: 0;
  }
  .settings-rule-input {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e5e7eb;
    font-size: 10px;
    font-family: ui-monospace, monospace;
    padding: 3px 5px;
    outline: none;
  }
  .settings-rule-input:focus {
    border-color: rgba(96, 165, 250, 0.5);
  }
  .settings-rule-input.rule-error {
    border-color: #ef4444 !important;
  }
  .settings-panel.theme-light .settings-rule-input {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.12);
    color: #374151;
  }
  .settings-rule-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    background: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    font-size: 10px;
  }
  .settings-rule-btn:hover {
    color: #f3f4f6;
    background: rgba(255, 255, 255, 0.08);
  }
  .settings-panel.theme-light .settings-rule-btn:hover {
    color: #111827;
    background: rgba(0, 0, 0, 0.06);
  }
  .settings-rule-btn.rule-enabled {
    color: #34d399;
  }
  .settings-rule-btn.rule-disabled {
    color: #6b7280;
  }
  .settings-rule-row .settings-rule-btn {
    margin-top: 2px;
  }
  .settings-rule-add-btn {
    display: block;
    width: 100%;
    padding: 4px;
    margin-top: 4px;
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    background: none;
    color: #9ca3af;
    font-size: 10px;
    cursor: pointer;
  }
  .settings-rule-add-btn:hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: #d1d5db;
  }
  .settings-panel.theme-light .settings-rule-add-btn {
    border-color: rgba(0, 0, 0, 0.15);
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-rule-add-btn:hover {
    border-color: rgba(0, 0, 0, 0.3);
    color: #374151;
  }
  .settings-rule-reset-btn {
    display: block;
    width: 100%;
    padding: 3px;
    margin-top: 2px;
    border: none;
    background: none;
    color: #9ca3af;
    font-size: 10px;
    cursor: pointer;
    text-align: center;
  }
  .settings-rule-reset-btn:hover {
    color: #d1d5db;
  }
  .settings-panel.theme-light .settings-rule-reset-btn:hover {
    color: #374151;
  }

  .settings-noise-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 140px;
    overflow-y: auto;
    margin-top: 6px;
    padding-right: 2px;
  }
  .settings-noise-pills::-webkit-scrollbar {
    width: 4px;
  }
  .settings-noise-pills::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
  .settings-noise-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    padding: 2px 6px 2px 8px;
    font-size: 10px;
    font-family: ui-monospace, monospace;
    color: #e5e7eb;
    line-height: 1.4;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  .settings-noise-pill:hover {
    border-color: rgba(96, 165, 250, 0.5);
  }
  .settings-noise-pill.active {
    border-color: rgba(96, 165, 250, 0.8);
    background: rgba(96, 165, 250, 0.12);
  }
  .settings-panel.theme-light .settings-noise-pill {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.12);
    color: #374151;
  }
  .settings-panel.theme-light .settings-noise-pill:hover {
    border-color: rgba(96, 165, 250, 0.5);
  }
  .settings-panel.theme-light .settings-noise-pill.active {
    border-color: rgba(96, 165, 250, 0.8);
    background: rgba(96, 165, 250, 0.08);
  }
  .noise-pill-text {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .noise-pill-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 0;
    font-size: 11px;
    line-height: 1;
    flex-shrink: 0;
  }
  .noise-pill-remove:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.15);
  }
  .settings-panel.theme-light .noise-pill-remove:hover {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
  }
  .settings-noise-add {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }
  .settings-noise-add-btn {
    padding: 3px 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    background: none;
    color: #9ca3af;
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .settings-noise-add-btn:hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: #d1d5db;
  }
  .settings-panel.theme-light .settings-noise-add-btn {
    border-color: rgba(0, 0, 0, 0.15);
    color: #6b7280;
  }
  .settings-panel.theme-light .settings-noise-add-btn:hover {
    border-color: rgba(0, 0, 0, 0.3);
    color: #374151;
  }
  .noise-match-count {
    font-size: 9px;
    color: #6b7280;
    margin-left: 2px;
  }
  .noise-match-count.has-matches {
    color: #60a5fa;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spinner {
    animation: spin 1s linear infinite;
  }
`;
