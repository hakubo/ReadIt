import { createRoot, Root } from "react-dom/client";
import { SelectionButton } from "./SelectionButton";
import { FloatingPlayer, type LoadingStatus, type PlayerState } from "./FloatingPlayer";
import { type TTSSettings, type SitePrefs, type TextReplacementRule } from "@/shared/types";
import { getEffectiveSettings, getDomainSettings, saveGlobalSettings, saveDomainSettings } from "@/shared/settings";

// Inject styles into shadow DOM
const SHADOW_STYLES = `
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
    align-items: center;
    gap: 4px;
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

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spinner {
    animation: spin 1s linear infinite;
  }
`;

// Per-domain preferences (position, enabled, etc.)
const currentDomain = window.location.hostname;
const SITE_KEY = `site:${currentDomain}`;

let sitePrefs: SitePrefs = {};

function saveSitePrefs(updates: Partial<SitePrefs>) {
  sitePrefs = { ...sitePrefs, ...updates };
  chrome.storage.local.set({ [SITE_KEY]: sitePrefs });
}

// State
let selectionButtonRoot: Root | null = null;
let selectionButtonContainer: HTMLDivElement | null = null;
let playerRoot: Root | null = null;
let playerContainer: HTMLDivElement | null = null;
let selectedText = "";
let isLoading = false;
let loadingStatus: LoadingStatus = "starting";

// Streaming state
let totalChunks = 0;
let isStreaming = false;
let currentSpeed = 1;
let closedManually = false;

// Player state (now computed locally from audio element)
let playerState: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  currentIndex: 0,
  queueLength: 0,
};

// Audio playback engine state (extension iframe — bypasses page CSP, preserves pitch)
let playerIframe: HTMLIFrameElement | null = null;
let playerReady = false;
let playerMsgQueue: Record<string, unknown>[] = [];
let sentenceWavData: (ArrayBuffer | null)[] = [];
let sentenceDurations: number[] = [];
let currentSentenceIdx = 0;
let isManuallyNavigating = false;
let currentSentenceElapsed = 0; // tracked via iframe timeupdate

// Generation context (stored from TTS_STREAM_START)
let generationSentences: string[] = [];

// Time tracking
let totalElapsedTime = 0;
let totalEstimatedDuration = 0;
let initialEstimatedDuration = 0; // Text-length estimate before any WAV arrives

// Finished state (all chunks played)
let isFinished = false;

// Model download progress
let downloadProgress: { downloaded: number; total: number } | null = null;

// Extension enabled state (toggled by browser icon)
let extensionEnabled = true;

// Settings panel requested from context menu
let openSettingsRequested = false;

// Sentence highlighting state - overlay approach (doesn't modify page DOM)
let highlightOverlay: HTMLDivElement | null = null;
let currentHighlightBoxes: HTMLDivElement[] = []; // Only boxes for current sentence
let sentences: string[] = [];
let highlightingEnabled = true;
let autoScrollEnabled = true;
let highlightColor = "rgba(254, 240, 138, 0.55)"; // Default light yellow with transparency

// Pre-computed sentence rects (absolute page coordinates) and overlay event handlers
let sentenceRectsCache: DOMRect[][] = [];
let currentHighlightIndex = -1;
let highlightScrollHandler: (() => void) | null = null;
let highlightResizeHandler: (() => void) | null = null;
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let highlightStyleEl: HTMLStyleElement | null = null;

// Selector preview highlight (shown when input is focused)
let selectorPreviewHighlight: HTMLDivElement | null = null;
let selectorInputFocused = false;

// Theme state
let currentTheme: "light" | "dark" = "dark";

// --- Local audio playback engine (extension iframe — bypasses page CSP) ---

function ensurePlayerIframe(): HTMLIFrameElement {
  if (playerIframe) {return playerIframe;}

  // Remove stale iframes from previous extension loads
  document.querySelectorAll("iframe[data-unmute-player]").forEach(el => el.remove());

  const iframeSrc = chrome.runtime.getURL("player.html");
  playerIframe = document.createElement("iframe");
  playerIframe.src = iframeSrc;
  playerIframe.setAttribute("data-unmute-player", "1");
  playerIframe.style.cssText = "width:0;height:0;border:none;position:fixed;top:-9999px;";
  playerIframe.allow = "autoplay";
  document.documentElement.appendChild(playerIframe);

  window.addEventListener("message", (e) => {
    if (e.source !== playerIframe?.contentWindow) {return;}
    const msg = e.data;
    if (!msg || !msg.type) {return;}

    if (msg.type === "PLAYER_READY") {
      playerReady = true;
      for (const queued of playerMsgQueue) {
        playerIframe?.contentWindow?.postMessage(queued, "*");
      }
      playerMsgQueue = [];
    }
    if (msg.type === "PLAYER_TIME") {
      // Only track time while we know we're playing
      if (!playerState.isPlaying) {return;}
      currentSentenceElapsed = (msg.currentTime || 0) * currentSpeed;
      totalElapsedTime = computeElapsedTime();
      playerState = {
        ...playerState,
        currentTime: totalElapsedTime,
        currentIndex: currentSentenceIdx,
      };
      updatePlayer();
    }
    if (msg.type === "PLAYER_ENDED") {
      handleAudioEnded();
    }
    if (msg.type === "PLAYER_PLAYING") {
      playerState = { ...playerState, isPlaying: true };
      updatePlayer();
    }
    if (msg.type === "PLAYER_PAUSED") {
      playerState = { ...playerState, isPlaying: false };
      updatePlayer();
    }
  });

  return playerIframe;
}

function postToPlayer(msg: Record<string, unknown>) {
  ensurePlayerIframe();
  if (!playerReady) {
    playerMsgQueue.push(msg);
    return;
  }
  playerIframe?.contentWindow?.postMessage(msg, "*");
}

function computeElapsedTime(): number {
  let elapsed = 0;
  for (let i = 0; i < currentSentenceIdx; i++) {
    elapsed += sentenceDurations[i] || 0;
  }
  elapsed += currentSentenceElapsed;
  return elapsed;
}

function computeTotalDuration(): number {
  let knownTotal = 0;
  let knownCount = 0;
  for (const d of sentenceDurations) {
    if (d > 0) {
      knownTotal += d;
      knownCount++;
    }
  }
  // Before any WAV arrives, use the text-length estimate
  if (knownCount === 0) {return initialEstimatedDuration;}
  // Estimate remaining ungenerated sentences
  const remaining = totalChunks - knownCount;
  if (remaining > 0) {
    const avg = knownTotal / knownCount;
    return knownTotal + avg * remaining;
  }
  return knownTotal;
}

function handleAudioEnded() {
  if (isManuallyNavigating) {return;}

  const nextIdx = currentSentenceIdx + 1;
  if (nextIdx < totalChunks) {
    currentSentenceElapsed = 0;
    if (sentenceWavData[nextIdx]) {
      currentSentenceIdx = nextIdx;
      playCurrentSentence();
    } else {
      // WAV not ready yet — wait for it
      currentSentenceIdx = nextIdx;
      playerState = { ...playerState, isPlaying: false, currentIndex: nextIdx };
      updateHighlight(nextIdx);
      updatePlayer();
    }
  } else {
    // Finished all sentences — clear highlight but keep overlay for potential resume
    isFinished = true;
    playerState = { ...playerState, isPlaying: false, currentIndex: currentSentenceIdx };
    currentHighlightBoxes.forEach(box => box.remove());
    currentHighlightBoxes = [];
    currentHighlightIndex = -1;
    updatePlayer();
  }
}

function playCurrentSentence() {
  const wavData = sentenceWavData[currentSentenceIdx];
  if (!wavData) {return;}

  currentSentenceElapsed = 0;
  isManuallyNavigating = false;

  postToPlayer({ type: "LOAD_WAV", wavData, speed: currentSpeed });

  playerState = {
    ...playerState,
    isPlaying: true,
    currentIndex: currentSentenceIdx,
    queueLength: sentenceWavData.filter(d => d !== null).length,
  };
  totalElapsedTime = computeElapsedTime();
  totalEstimatedDuration = computeTotalDuration();
  updateHighlight(currentSentenceIdx);
  updatePlayer();

  // Advance windowed generation
  chrome.runtime.sendMessage({
    type: "ADVANCE_GENERATION",
    upTo: currentSentenceIdx + 15,
  });
}

function handleLocalPlay() {
  postToPlayer({ type: "PLAY" });
}

function handleLocalPause() {
  postToPlayer({ type: "PAUSE" });
}

function handleSkipForward() {
  if (currentSentenceIdx >= totalChunks - 1) {return;}
  isManuallyNavigating = true;
  postToPlayer({ type: "PAUSE" });
  currentSentenceIdx++;
  handleSeekToSentence(currentSentenceIdx);
}

function handleSkipBack() {
  if (currentSentenceIdx <= 0) {
    // Restart current sentence
    postToPlayer({ type: "RESTART" });
    return;
  }
  isManuallyNavigating = true;
  postToPlayer({ type: "PAUSE" });
  currentSentenceIdx--;
  handleSeekToSentence(currentSentenceIdx);
}

function handleSeekToSentence(idx: number) {
  if (idx < 0 || idx >= totalChunks) {return;}
  // Pause current audio and guard against the "ended" event racing
  // with the seek (otherwise handleAudioEnded advances to idx+1).
  isManuallyNavigating = true;
  postToPlayer({ type: "PAUSE" });
  isFinished = false;
  currentSentenceIdx = idx;

  if (sentenceWavData[idx]) {
    playCurrentSentence();
  } else {
    // WAV not generated yet — tell offscreen to skip ahead and generate this sentence next
    chrome.runtime.sendMessage({
      type: "REGENERATE_SENTENCE",
      index: idx,
    });
    playerState = { ...playerState, isPlaying: false, currentIndex: idx };
    updateHighlight(idx);
    updatePlayer();
  }
}

function handleLocalSetSpeed(speed: number) {
  currentSpeed = speed;
  postToPlayer({ type: "SET_SPEED", speed });
  persistSpeedChange(speed);
  updatePlayer();
}

function cleanupAudioEngine() {
  postToPlayer({ type: "RESET" });
  sentenceWavData = [];
  sentenceDurations = [];
  currentSentenceIdx = 0;
  currentSentenceElapsed = 0;
  isManuallyNavigating = false;
  generationSentences = [];
}

// Seek cursor style element (injected into host page during playback)
let seekCursorStyle: HTMLStyleElement | null = null;

function updateSeekCursor() {
  const hasAudio = playerState.queueLength > 0;
  if (hasAudio && !seekCursorStyle) {
    seekCursorStyle = document.createElement("style");
    seekCursorStyle.textContent = `
      body.unmute-reading p,
      body.unmute-reading li,
      body.unmute-reading h1, body.unmute-reading h2, body.unmute-reading h3,
      body.unmute-reading h4, body.unmute-reading h5, body.unmute-reading h6,
      body.unmute-reading blockquote,
      body.unmute-reading td, body.unmute-reading th,
      body.unmute-reading figcaption,
      body.unmute-reading dt, body.unmute-reading dd {
        cursor: pointer !important;
      }
    `;
    document.head.appendChild(seekCursorStyle);
    document.body.classList.add("unmute-reading");
  } else if (!hasAudio && seekCursorStyle) {
    document.body.classList.remove("unmute-reading");
    seekCursorStyle.remove();
    seekCursorStyle = null;
  }
}

async function getSettings(): Promise<TTSSettings> {
  return getEffectiveSettings(currentDomain);
}

// Init is called at the bottom of the file after all functions are defined

// Split text into sentences using Intl.Segmenter (same logic as offscreen)
function splitIntoSentences(text: string): string[] {
  let result: string[];
  try {
    // Intl.Segmenter provides proper sentence boundary detection
    const Segmenter = (Intl as unknown as { Segmenter: new (locale: string, options: { granularity: string }) => { segment: (text: string) => Iterable<{ segment: string }> } }).Segmenter;
    const segmenter = new Segmenter('en', { granularity: 'sentence' });
    const segments = segmenter.segment(text);
    result = Array.from(segments, (s: { segment: string }) => s.segment.trim()).filter(s => s.length > 0);
  } catch {
    // Fallback for environments without Intl.Segmenter support
    const sentences = text.split(/(?<=[.!?])\s+/);
    result = sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  return result;
}

// Create highlight overlay using fixed positioning (renders above sticky/fixed headers)
function createHighlightOverlay() {
  highlightOverlay = document.createElement("div");
  highlightOverlay.id = "unmute-highlight-overlay";
  highlightOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 10000;
  `;
  document.documentElement.appendChild(highlightOverlay);

  // Inject keyframe for pulse animation into the main document
  // (Shadow DOM @keyframes don't apply to elements in the main document)
  highlightStyleEl = document.createElement("style");
  highlightStyleEl.textContent = `
    @keyframes unmute-pulse-opacity {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.15; }
    }
  `;
  document.head.appendChild(highlightStyleEl);

  // Scroll handler: reposition existing boxes when user scrolls
  highlightScrollHandler = () => repositionHighlightBoxes();
  window.addEventListener("scroll", highlightScrollHandler, { passive: true });

  // Resize handler: re-compute cached rects when layout changes
  highlightResizeHandler = () => {
    if (resizeDebounceTimer) {clearTimeout(resizeDebounceTimer);}
    resizeDebounceTimer = setTimeout(() => {
      precomputeAllSentenceRects();
      if (currentHighlightIndex >= 0) {
        applyHighlightForSentence(currentHighlightIndex);
      }
    }, 200);
  };
  window.addEventListener("resize", highlightResizeHandler);
}

// Merge overlapping or adjacent rectangles on the same line
function mergeRects(rects: DOMRectList): DOMRect[] {
  if (rects.length === 0) {return [];}

  // Convert to array and sort by top, then left
  const rectArray = Array.from(rects).sort((a, b) => {
    if (Math.abs(a.top - b.top) < 5) {return a.left - b.left;} // Same line
    return a.top - b.top;
  });

  const merged: DOMRect[] = [];
  let current = rectArray[0];

  for (let i = 1; i < rectArray.length; i++) {
    const next = rectArray[i];
    // Check if on same line (similar top) and overlapping/adjacent
    const sameLine = Math.abs(current.top - next.top) < 5;
    const overlaps = next.left <= current.right + 2; // 2px tolerance

    if (sameLine && overlaps) {
      // Merge: extend current rect to include next
      const newRight = Math.max(current.right, next.right);
      const newBottom = Math.max(current.bottom, next.bottom);
      current = new DOMRect(
        current.left,
        Math.min(current.top, next.top),
        newRight - current.left,
        newBottom - Math.min(current.top, next.top)
      );
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}

// Pre-compute rects for ALL sentences in a single sequential window.find() pass.
// Because window.find() resumes from the last match, sequential calls naturally
// find the correct occurrence in DOM order — fixing the "wrong sentence" bug when
// the same text appears multiple times on the page.
function precomputeAllSentenceRects() {
  const selection = window.getSelection();
  if (!selection || sentences.length === 0) {return;}

  const savedX = window.scrollX;
  const savedY = window.scrollY;

  selection.removeAllRanges();

  const windowFind = (window as unknown as { find: (str: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean, wholeWord?: boolean, searchInFrames?: boolean, showDialog?: boolean) => boolean }).find;

  sentenceRectsCache = [];

  for (let s = 0; s < sentences.length; s++) {
    let rects: DOMRect[] = [];

    for (let attempt = 0; attempt < 10; attempt++) {
      const found = windowFind.call(window, sentences[s], true, false, false, false, true, false);
      if (!found || selection.rangeCount === 0) {break;}

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const el = container.nodeType === Node.ELEMENT_NODE
        ? container as Element
        : container.parentElement;

      if (el && el.closest(NOISE_SELECTOR)) {
        continue;
      }

      // Convert viewport rects to absolute page coordinates
      const clientRects = mergeRects(range.getClientRects());
      rects = clientRects.map(r => new DOMRect(
        r.left + window.scrollX,
        r.top + window.scrollY,
        r.width,
        r.height
      ));
      break;
    }

    sentenceRectsCache.push(rects);
  }

  // Restore scroll and clear selection
  window.scrollTo(savedX, savedY);
  selection.removeAllRanges();
}

// Apply highlight boxes for a sentence from cached absolute coords,
// converting to viewport-relative coords for the fixed overlay.
function applyHighlightForSentence(index: number) {
  if (!highlightOverlay) {return;}

  currentHighlightBoxes.forEach(box => box.remove());
  currentHighlightBoxes = [];
  currentHighlightIndex = index;

  const rects = sentenceRectsCache[index];
  if (!rects) {return;}

  const sx = window.scrollX;
  const sy = window.scrollY;

  for (const r of rects) {
    const box = document.createElement("div");
    box.style.cssText = `
      position: absolute;
      left: ${r.x - sx}px;
      top: ${r.y - sy}px;
      width: ${r.width}px;
      height: ${r.height}px;
      background-color: ${highlightColor};
      border-radius: 3px;
      pointer-events: none;
    `;
    highlightOverlay.appendChild(box);
    currentHighlightBoxes.push(box);
  }
}

// Reposition existing highlight boxes on scroll (called from passive scroll listener).
// Simply updates left/top from cached absolute coords minus current scroll offset.
function repositionHighlightBoxes() {
  if (currentHighlightIndex < 0) {return;}
  const rects = sentenceRectsCache[currentHighlightIndex];
  if (!rects || rects.length !== currentHighlightBoxes.length) {return;}

  const sx = window.scrollX;
  const sy = window.scrollY;

  for (let i = 0; i < rects.length; i++) {
    currentHighlightBoxes[i].style.left = `${rects[i].x - sx}px`;
    currentHighlightBoxes[i].style.top = `${rects[i].y - sy}px`;
  }
}

// Update sentence highlighting and auto-scroll based on current playing index.
// Uses pre-computed cached rects — no window.find() calls during playback.
function updateHighlight(index: number) {
  if (index < 0 || index >= sentences.length) {return;}

  if (highlightingEnabled && highlightOverlay) {
    applyHighlightForSentence(index);
  }

  const rects = sentenceRectsCache[index];
  if (autoScrollEnabled && rects && rects.length > 0) {
    // Only auto-scroll when sentence exits the BOTTOM of the viewport.
    // If the user scrolled past it (sentence is above viewport), don't pull them back.
    const absY = rects[0].y;
    const absBottom = rects[0].y + rects[0].height;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    if (absBottom > viewportBottom) {
      window.scrollTo({
        top: absY - window.innerHeight / 3,
        behavior: "smooth",
      });
    }
  }
}

// Clean up sentence highlighting
function cleanupHighlighting() {
  // Remove event listeners
  if (highlightScrollHandler) {
    window.removeEventListener("scroll", highlightScrollHandler);
    highlightScrollHandler = null;
  }
  if (highlightResizeHandler) {
    window.removeEventListener("resize", highlightResizeHandler);
    highlightResizeHandler = null;
  }
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = null;
  }
  // Remove injected keyframe style
  if (highlightStyleEl) {
    highlightStyleEl.remove();
    highlightStyleEl = null;
  }
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
  currentHighlightBoxes = [];
  sentenceRectsCache = [];
  currentHighlightIndex = -1;
  sentences = [];
}

// Tags that are unlikely to contain main readable content
const NOISE_SELECTORS = [
  "nav", "footer", "header", "aside",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[role='complementary']",
  ".sidebar", ".nav", ".menu", ".footer", ".header", ".ad", ".ads", ".advertisement",
  ".comment", ".comments", ".widget", ".social", ".share", ".related",
  "script", "style", "noscript", "iframe", "svg", "form",
];

const NOISE_SELECTOR = NOISE_SELECTORS.join(",");
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, th, td, pre";

/**
 * Best-effort extraction of a page's main readable content.
 * 1. Try semantic elements: <article>, <main>, [role="main"]
 * 2. Fall back to scoring visible block elements by text density
 *
 * Returns text extracted per-block-element so that each sentence
 * matches the actual page text (needed for window.find highlighting).
 */
function detectMainContent(): string | null {
  // Use saved content selector only if it matches exactly one element
  if (sitePrefs.contentSelector) {
    try {
      const matches = document.querySelectorAll(sitePrefs.contentSelector);
      if (matches.length === 1) {
        const el = matches[0];
        const text = extractTextFromContainer(el);
        if (text.length > 0) {return text;}
        // Fallback: use element's own textContent (e.g., no block-level children)
        const raw = (el.textContent || "").trim();
        if (raw.length > 0) {return raw;}
      }
    } catch { /* invalid selector — fall through */ }
    // Selector matches 0 or >1 elements — fall through to heuristics
  }

  const target = detectContentElement();
  if (target) {
    const text = extractTextFromContainer(target);
    if (text.length > 100) {return text;}
  }

  // Last resort: all <p> tags on the page
  const paragraphs = Array.from(document.querySelectorAll("p"))
    .filter((p) => !p.closest(NOISE_SELECTOR))
    .map((p) => (p.textContent || "").trim())
    .filter((t) => t.length > 20);
  if (paragraphs.length > 0) {
    return paragraphs.join("\n");
  }

  return null;
}

// Score an element by its clean text length (for comparison only)
function scoreContentLength(el: Element): number {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(NOISE_SELECTOR).forEach((n) => n.remove());
  return (clone.textContent || "").length;
}

// Check if an element has a noise ancestor within a given boundary.
function hasNoiseAncestor(el: Element, boundary: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur !== boundary) {
    if (cur.matches(NOISE_SELECTOR)) {return true;}
    cur = cur.parentElement;
  }
  return false;
}

// Extract readable text from an element's block children.
function extractTextFromContainer(container: Element): string {
  const blocks = container.querySelectorAll(BLOCK_SELECTOR);
  const texts: string[] = [];
  for (const block of blocks) {
    if (hasNoiseAncestor(block, container)) {continue;}
    if (block.querySelector(BLOCK_SELECTOR)) {continue;}
    const t = (block.textContent || "").trim();
    if (t.length > 0) {texts.push(t);}
  }
  return texts.join("\n");
}

// Detect the best container element for main page content using heuristics.
function detectContentElement(): Element | null {
  let target: Element | null = null;

  // 1. Try <main> or [role="main"]
  const main = document.querySelector("main, [role='main']");
  if (main && scoreContentLength(main) > 100) {
    target = main;
  }

  // 2. Try <article> — pick the longest one
  if (!target) {
    const articles = document.querySelectorAll("article");
    let bestLen = 0;
    for (const article of articles) {
      const len = scoreContentLength(article);
      if (len > bestLen) {
        bestLen = len;
        target = article;
      }
    }
    if (target && bestLen < 100) {target = null;}
  }

  // 3. Score block containers by text density
  if (!target) {
    const candidates = document.querySelectorAll("div, section");
    let bestScore = 0;

    for (const el of candidates) {
      if (el.closest("#unmute-player, #unmute-selection-button")) {continue;}

      const len = scoreContentLength(el);
      if (len < 200) {continue;}

      const linkText = Array.from(el.querySelectorAll("a"))
        .reduce((sum, a) => sum + (a.textContent || "").length, 0);
      if (len > 0 && linkText / len > 0.5) {continue;}

      const pCount = el.querySelectorAll("p").length;
      const score = len + pCount * 100;

      if (score > bestScore) {
        bestScore = score;
        target = el;
      }
    }
  }

  return target;
}

// --- Text processing (must match offscreen so sentence indices align) ---

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
  return text.match(urlRegex) || [];
}

async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_PAGE_TITLE', url });
    return response?.title || null;
  } catch { return null; }
}

async function replaceUrlsWithTitles(text: string): Promise<string> {
  const urls = extractUrls(text);
  if (urls.length === 0) {return text;}
  let result = text;
  const titles = await Promise.all(urls.map(url => fetchPageTitle(url)));
  for (let i = 0; i < urls.length; i++) {
    if (titles[i]) {result = result.replace(urls[i], titles[i]!);}
  }
  return result;
}

function humanizeText(text: string, rules: TextReplacementRule[]): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) {continue;}
    try {
      result = result.replace(new RegExp(rule.pattern, rule.flags || "gi"), rule.replacement);
    } catch { continue; }
  }
  return result;
}

// Persist speed to the correct storage (domain if override exists, else global)
async function persistSpeedChange(speed: number) {
  const domainSettings = await getDomainSettings(currentDomain);
  if (domainSettings) {
    await saveDomainSettings(currentDomain, { ...domainSettings, speed });
  } else {
    const global = await getSettings();
    await saveGlobalSettings({ ...global, speed });
  }
}

// --- Element Picker for Content Selector ---
let pickerActive = false;
let pickerOverlay: HTMLDivElement | null = null;
let pickerHighlight: HTMLDivElement | null = null;
let pickerTooltip: HTMLDivElement | null = null;
let pickerExtraHighlights: HTMLDivElement[] = [];
let pickerAutoDetectHighlight: HTMLDivElement | null = null;

function generateSelector(el: Element): string {
  // 1. ID — always unique
  if (el.id) {return `#${el.id}`;}

  const tag = el.tagName.toLowerCase();

  // Helper: check if a selector matches exactly this element
  function isUnique(sel: string): boolean {
    try {
      const matches = document.querySelectorAll(sel);
      return matches.length === 1 && matches[0] === el;
    } catch { return false; }
  }

  // Build a short parent prefix for scoping (up to 2 levels)
  function parentPrefix(): string {
    const parts: string[] = [];
    let ancestor = el.parentElement;
    for (let depth = 0; depth < 2 && ancestor; depth++, ancestor = ancestor.parentElement) {
      if (ancestor.id) { parts.unshift(`#${ancestor.id}`); return parts.join(" > "); }
      parts.unshift(ancestor.tagName.toLowerCase());
    }
    return parts.join(" > ");
  }

  // 2. Semantic elements (unique by tag alone on most pages)
  const semanticTags = ["main", "article", "nav", "aside", "header", "footer", "section"];
  if (semanticTags.includes(tag) && isUnique(tag)) {return tag;}

  // 3. ARIA role attributes (role="main", role="article", etc.)
  const role = el.getAttribute("role");
  if (role) {
    const sel = `[role="${CSS.escape(role)}"]`;
    if (isUnique(sel)) {return sel;}
  }

  // 4. data-* attributes that suggest main content
  const contentDataAttrs = [
    "data-content", "data-main", "data-main-content", "data-article",
    "data-body", "data-page-content", "data-post", "data-post-content",
    "data-entry", "data-entry-content", "data-text", "data-story",
    "data-testid", "data-component", "data-section", "data-block",
    "data-container", "data-region", "data-area",
  ];
  for (const attr of contentDataAttrs) {
    if (el.hasAttribute(attr)) {
      const val = el.getAttribute(attr)!;
      const sel = val
        ? `[${attr}="${CSS.escape(val)}"]`
        : `[${attr}]`;
      if (isUnique(sel)) {return sel;}
    }
  }
  // Also check any data- attr with "content", "article", "main", "body", "post" in its name
  for (const attr of el.getAttributeNames()) {
    if (!attr.startsWith("data-")) {continue;}
    if (/content|article|main|body|post|entry|story/i.test(attr)) {
      const val = el.getAttribute(attr)!;
      const sel = val
        ? `[${attr}="${CSS.escape(val)}"]`
        : `[${attr}]`;
      if (isUnique(sel)) {return sel;}
    }
  }

  // 5. aria-label (often unique and descriptive)
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const sel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
    if (isUnique(sel)) {return sel;}
  }

  // 6. Class-based (try tag.class, then with parent prefix)
  if (el.className && typeof el.className === "string") {
    const classes = el.className.trim().split(/\s+/).filter(c =>
      c.length > 0 && !c.startsWith("_") && !c.startsWith("css-") && !/^[a-z]{1,2}\d/.test(c)
    );
    for (const cls of classes) {
      const sel = `${tag}.${CSS.escape(cls)}`;
      if (isUnique(sel)) {return sel;}
    }
    // Try with parent prefix
    const prefix = parentPrefix();
    if (prefix) {
      for (const cls of classes) {
        const sel = `${prefix} > ${tag}.${CSS.escape(cls)}`;
        if (isUnique(sel)) {return sel;}
      }
    }
  }

  // 7. Tag with parent ID context
  const parent = el.parentElement;
  if (parent?.id) {
    const sel = `#${parent.id} > ${tag}`;
    if (isUnique(sel)) {return sel;}
  }

  // 8. Tag + nth-of-type with parent context
  if (parent) {
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;
    const prefix = parentPrefix();
    const sel = `${prefix} > ${tag}:nth-of-type(${idx})`;
    if (isUnique(sel)) {return sel;}
  }

  // 9. Fallback: tag only (may match multiple)
  return tag;
}

function showSelectorPreview() {
  hideSelectorPreview();
  const selector = sitePrefs.contentSelector;
  if (!selector) {return;}
  let matches: NodeListOf<Element>;
  try { matches = document.querySelectorAll(selector); } catch { return; }
  if (matches.length === 0) {return;}

  const isUnique = matches.length === 1;
  const color = isUnique ? "rgba(96,165,250,0.9)" : "rgba(239,68,68,0.9)";
  const bg = isUnique ? "rgba(96,165,250,0.06)" : "rgba(239,68,68,0.06)";

  // Highlight the first match prominently
  const rect = matches[0].getBoundingClientRect();
  selectorPreviewHighlight = document.createElement("div");
  selectorPreviewHighlight.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483645;
    border: 2px solid ${color}; background: ${bg};
    border-radius: 4px;
    left: ${rect.left}px; top: ${rect.top}px;
    width: ${rect.width}px; height: ${rect.height}px;
  `;

  // Show extra match outlines if non-unique
  if (!isUnique) {
    for (let i = 1; i < matches.length; i++) {
      const r = matches[i].getBoundingClientRect();
      const extra = document.createElement("div");
      extra.className = "selector-preview-extra";
      extra.style.cssText = `
        position: fixed; pointer-events: none; z-index: 2147483645;
        border: 2px dashed rgba(239,68,68,0.6);
        border-radius: 4px;
        left: ${r.left}px; top: ${r.top}px;
        width: ${r.width}px; height: ${r.height}px;
      `;
      selectorPreviewHighlight.appendChild(extra);
    }
  }

  document.documentElement.appendChild(selectorPreviewHighlight);
}

function hideSelectorPreview() {
  if (selectorPreviewHighlight) {
    selectorPreviewHighlight.remove();
    selectorPreviewHighlight = null;
  }
}

function startElementPicker() {
  if (pickerActive) {return;}
  pickerActive = true;

  // Stash the last hovered element so click can use it even if elementFromPoint
  // returns the overlay itself on fast clicks.
  let lastHoveredElement: Element | null = null;

  pickerOverlay = document.createElement("div");
  pickerOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483646; cursor: crosshair;
  `;

  pickerHighlight = document.createElement("div");
  pickerHighlight.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483646;
    border: 2px solid #3b82f6; background: rgba(59,130,246,0.1);
    border-radius: 4px; transition: all 0.05s ease;
    display: none;
  `;

  pickerTooltip = document.createElement("div");
  pickerTooltip.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483647;
    background: #1f2937; color: #e5e7eb; font-size: 11px;
    font-family: ui-monospace, monospace; padding: 4px 8px;
    border-radius: 4px; white-space: nowrap; display: none;
  `;

  document.documentElement.appendChild(pickerOverlay);
  document.documentElement.appendChild(pickerHighlight);
  document.documentElement.appendChild(pickerTooltip);

  // Show purple outline on the auto-detected content element
  const autoDetected = detectContentElement();
  if (autoDetected) {
    const adRect = autoDetected.getBoundingClientRect();
    pickerAutoDetectHighlight = document.createElement("div");
    pickerAutoDetectHighlight.style.cssText = `
      position: fixed; pointer-events: none; z-index: 2147483645;
      border: 2px dashed #a855f7; background: rgba(168,85,247,0.06);
      border-radius: 4px;
      left: ${adRect.left}px; top: ${adRect.top}px;
      width: ${adRect.width}px; height: ${adRect.height}px;
    `;
    const label = document.createElement("div");
    label.style.cssText = `
      position: absolute; top: 4px; left: 4px;
      background: rgba(168,85,247,0.85); color: white; font-size: 10px;
      font-family: system-ui, sans-serif; padding: 2px 6px;
      border-radius: 3px; white-space: nowrap;
    `;
    label.textContent = "Default content area";
    pickerAutoDetectHighlight.appendChild(label);
    document.documentElement.appendChild(pickerAutoDetectHighlight);
  }

  function clearExtraHighlights() {
    for (const h of pickerExtraHighlights) {h.remove();}
    pickerExtraHighlights = [];
  }

  function peekElementAt(x: number, y: number): Element | null {
    pickerOverlay!.style.pointerEvents = "none";
    pickerHighlight!.style.display = "none";
    if (pickerAutoDetectHighlight) {pickerAutoDetectHighlight.style.display = "none";}
    for (const h of pickerExtraHighlights) {h.style.display = "none";}
    const el = document.elementFromPoint(x, y);
    pickerOverlay!.style.pointerEvents = "auto";
    pickerHighlight!.style.display = lastHoveredElement ? "block" : "none";
    if (pickerAutoDetectHighlight) {pickerAutoDetectHighlight.style.display = "block";}
    for (const h of pickerExtraHighlights) {h.style.display = "block";}
    if (!el || el === pickerOverlay || el === pickerHighlight || el === pickerTooltip ||
        el === pickerAutoDetectHighlight ||
        el.closest("#unmute-player, #unmute-selection-button")) {
      return null;
    }
    return el;
  }

  const onMouseMove = (e: MouseEvent) => {
    clearExtraHighlights();
    const target = peekElementAt(e.clientX, e.clientY);
    if (!target) {
      pickerHighlight!.style.display = "none";
      pickerTooltip!.style.display = "none";
      lastHoveredElement = null;
      return;
    }

    lastHoveredElement = target;
    const selector = generateSelector(target);
    let matchCount = 1;
    try { matchCount = document.querySelectorAll(selector).length; } catch { matchCount = 0; }
    const isUnique = matchCount === 1;

    // Primary highlight — blue if unique, red if not
    const rect = target.getBoundingClientRect();
    pickerHighlight!.style.display = "block";
    pickerHighlight!.style.left = `${rect.left}px`;
    pickerHighlight!.style.top = `${rect.top}px`;
    pickerHighlight!.style.width = `${rect.width}px`;
    pickerHighlight!.style.height = `${rect.height}px`;
    pickerHighlight!.style.borderColor = isUnique ? "#3b82f6" : "#ef4444";
    pickerHighlight!.style.background = isUnique ? "rgba(59,130,246,0.1)" : "rgba(239,68,68,0.1)";

    // Tooltip: selector + warning if not unique
    const warning = !isUnique
      ? (matchCount === 0 ? " — no matches" : ` — matches ${matchCount} elements`)
      : "";
    pickerTooltip!.textContent = selector + warning;
    pickerTooltip!.style.background = isUnique ? "#1f2937" : "#7f1d1d";
    pickerTooltip!.style.display = "block";
    pickerTooltip!.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 200)}px`;
    pickerTooltip!.style.top = `${Math.min(e.clientY + 16, window.innerHeight - 30)}px`;

    // Show red outlines on all other matched elements
    if (!isUnique && matchCount > 1) {
      try {
        const allMatches = document.querySelectorAll(selector);
        for (const el of allMatches) {
          if (el === target) {continue;}
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) {continue;}
          const box = document.createElement("div");
          box.style.cssText = `
            position: fixed; pointer-events: none; z-index: 2147483646;
            border: 2px dashed #ef4444; background: rgba(239,68,68,0.08);
            border-radius: 4px;
            left: ${r.left}px; top: ${r.top}px;
            width: ${r.width}px; height: ${r.height}px;
          `;
          document.documentElement.appendChild(box);
          pickerExtraHighlights.push(box);
        }
      } catch { /* invalid selector */ }
    }
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const target = peekElementAt(e.clientX, e.clientY) || lastHoveredElement;

    if (target) {
      const selector = generateSelector(target);
      saveSitePrefs({ contentSelector: selector });
    }

    stopElementPicker();
    estimatePageDuration();
    updatePlayer();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      stopElementPicker();
    }
  };

  pickerOverlay.addEventListener("mousemove", onMouseMove);
  pickerOverlay.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);

  // Store cleanup refs
  (pickerOverlay as unknown as { _cleanup: () => void })._cleanup = () => {
    pickerOverlay?.removeEventListener("mousemove", onMouseMove);
    pickerOverlay?.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

function stopElementPicker() {
  if (!pickerActive) {return;}
  pickerActive = false;

  if (pickerOverlay) {
    (pickerOverlay as unknown as { _cleanup?: () => void })._cleanup?.();
    pickerOverlay.remove();
    pickerOverlay = null;
  }
  if (pickerHighlight) { pickerHighlight.remove(); pickerHighlight = null; }
  for (const h of pickerExtraHighlights) {h.remove();}
  pickerExtraHighlights = [];
  if (pickerAutoDetectHighlight) { pickerAutoDetectHighlight.remove(); pickerAutoDetectHighlight = null; }
  if (pickerTooltip) { pickerTooltip.remove(); pickerTooltip = null; }
}

function createShadowContainer(id: string): { container: HTMLDivElement; shadow: ShadowRoot; renderTarget: HTMLDivElement } {
  const container = document.createElement("div");
  container.id = id;
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: "open" });

  // Inject styles
  const style = document.createElement("style");
  style.textContent = SHADOW_STYLES;
  shadow.appendChild(style);

  // Create render target
  const renderTarget = document.createElement("div");
  shadow.appendChild(renderTarget);

  return { container, shadow, renderTarget };
}

function showSelectionButton(x: number, y: number) {
  if (!selectionButtonContainer) {
    const { container, renderTarget } = createShadowContainer("unmute-selection-button");
    selectionButtonContainer = container;
    selectionButtonRoot = createRoot(renderTarget);
  }

  selectionButtonRoot?.render(
    <SelectionButton
      position={{ x, y }}
      onRead={handleRead}
      loading={isLoading}
      theme={currentTheme}
    />
  );
}

function hideSelectionButton() {
  if (selectionButtonRoot && selectionButtonContainer) {
    selectionButtonRoot.unmount();
    selectionButtonContainer.remove();
    selectionButtonRoot = null;
    selectionButtonContainer = null;
  }
}

function handleRestart() {
  stopPlayback();
  handleRead();
}

function showPlayer() {
  if (!playerContainer) {
    const { container, renderTarget } = createShadowContainer("unmute-player");
    playerContainer = container;
    playerRoot = createRoot(renderTarget);
  }

  playerRoot?.render(
    <FloatingPlayer
      loading={isLoading}
      loadingStatus={loadingStatus}
      totalChunks={totalChunks}
      isStreaming={isStreaming}
      playerState={playerState}
      speed={currentSpeed}
      totalElapsedTime={totalElapsedTime}
      totalEstimatedDuration={totalEstimatedDuration}
      finished={isFinished}
      downloadProgress={downloadProgress}
      onPlay={() => {
        const idle = !isLoading && playerState.queueLength === 0 && !isFinished;
        if (idle) {
          // Try current text selection first
          const sel = window.getSelection()?.toString().trim();
          if (sel) {
            selectedText = sel;
            handleRead();
            return;
          }
          // Fall back to main page content
          const main = detectMainContent();
          if (main) {
            selectedText = main;
            handleRead();
            return;
          }
        }
        handleLocalPlay();
      }}
      onPause={() => handleLocalPause()}
      onRestart={handleRestart}
      onSetSpeed={(speed) => handleLocalSetSpeed(speed)}
      onClose={stopPlayback}
      forceSettingsOpen={openSettingsRequested}
      onSettingsOpened={() => { openSettingsRequested = false; }}
      domain={currentDomain}
      theme={currentTheme}
      initialPosition={sitePrefs.playerPosition}
      onPositionChange={(pos) => saveSitePrefs({ playerPosition: pos })}
      onPickContent={startElementPicker}
      contentSelector={sitePrefs.contentSelector}
      onClearContentSelector={() => { saveSitePrefs({ contentSelector: undefined }); hideSelectorPreview(); estimatePageDuration(); updatePlayer(); }}
      onSetContentSelector={(sel) => { saveSitePrefs({ contentSelector: sel || undefined }); if (selectorInputFocused) {showSelectorPreview();} estimatePageDuration(); updatePlayer(); }}
      onSelectorFocus={() => { selectorInputFocused = true; showSelectorPreview(); }}
      onSelectorBlur={() => { selectorInputFocused = false; hideSelectorPreview(); }}
    />
  );
}

function updatePlayer() {
  if (playerRoot) {
    showPlayer();
  }
  updateSeekCursor();
}

// Stop playback and return pill to idle state (pill stays visible)
function stopPlayback() {
  closedManually = true;
  isFinished = false;
  chrome.runtime.sendMessage({ type: "PLAYER_RESET" });
  cleanupAudioEngine();
  cleanupHighlighting();
  totalChunks = 0;
  isStreaming = false;
  totalElapsedTime = 0;
  totalEstimatedDuration = 0;
  initialEstimatedDuration = 0;
  playerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentIndex: 0,
    queueLength: 0,
  };
  isLoading = false;
  downloadProgress = null;
  updatePlayer();
}

// Fully remove the pill from the DOM (used when extension is toggled off)
function destroyPlayer() {
  stopPlayback();
  if (playerRoot && playerContainer) {
    playerRoot.unmount();
    playerContainer.remove();
    playerRoot = null;
    playerContainer = null;
  }
}

async function handleRead() {
  if (!selectedText || isLoading) {return;}
  closedManually = false;

  // Get settings first to set initial speed and highlighting preference
  const settings = await getSettings();
  currentSpeed = settings.speed;
  highlightingEnabled = settings.highlightSentences;
  highlightColor = settings.highlightColor || "#fef08a";
  autoScrollEnabled = settings.autoScroll !== false;
  currentTheme = settings.theme || "dark";

  // Split raw text into sentences first (matches page DOM for window.find highlighting),
  // then process each sentence individually for TTS. This guarantees a 1:1 mapping
  // between highlight indices and audio indices, even when humanizeText changes
  // sentence boundaries (e.g. "e.g." → "for example," removes a period).
  sentences = splitIntoSentences(selectedText);
  const processedSentences = await Promise.all(
    sentences.map(async (s) => humanizeText(await replaceUrlsWithTitles(s), settings.textReplacements))
  );

  // Pre-compute all sentence rects in a single sequential window.find() pass.
  // This also clears the selection, so no separate removeAllRanges() needed.
  precomputeAllSentenceRects();

  // Create highlight overlay (if enabled) - doesn't modify page DOM
  if (highlightingEnabled) {
    createHighlightOverlay();
  }

  // Reset previous playback and ensure player iframe exists
  cleanupAudioEngine();
  ensurePlayerIframe();

  isFinished = false;
  isLoading = true;
  isStreaming = true;
  loadingStatus = "starting";
  totalChunks = 0;
  totalElapsedTime = 0;
  // Estimate from selected text so we never show --:--
  const CHARS_PER_SEC = 14;
  totalEstimatedDuration = selectedText.length / CHARS_PER_SEC;
  initialEstimatedDuration = totalEstimatedDuration;
  playerState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentIndex: 0,
    queueLength: 0,
  };

  hideSelectionButton();
  showPlayer();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_TTS",
      sentences: processedSentences,
      settings,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "TTS generation failed");
    }

    isLoading = false;
    updatePlayer();
  } catch (error) {
    console.error("TTS generation failed:", error);
    isLoading = false;
    if (!closedManually) {
      stopPlayback();
      alert(
        `TTS generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

// Apply a TTSSettings object to local runtime state
function applySettingsChange(newSettings: TTSSettings) {
  if (newSettings.speed !== undefined && newSettings.speed !== currentSpeed) {
    currentSpeed = newSettings.speed;
    postToPlayer({ type: "SET_SPEED", speed: currentSpeed });
    updatePlayer();
  }
  if (newSettings.highlightSentences !== undefined) {
    highlightingEnabled = newSettings.highlightSentences;
  }
  if (newSettings.highlightColor && newSettings.highlightColor !== highlightColor) {
    highlightColor = newSettings.highlightColor;
    if (playerState.queueLength > 0 && highlightingEnabled) {
      updateHighlight(playerState.currentIndex);
    }
  }
  if (newSettings.autoScroll !== undefined) {
    autoScrollEnabled = newSettings.autoScroll;
  }
  if (newSettings.theme && newSettings.theme !== currentTheme) {
    currentTheme = newSettings.theme;
    updatePlayer();
  }
}

// Listen for settings changes from storage (sync = global, local = per-domain)
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync" && changes.settings?.newValue) {
    // Global settings changed — only apply if this domain has NO override
    const domainSettings = await getDomainSettings(currentDomain);
    if (!domainSettings) {
      applySettingsChange(changes.settings.newValue as TTSSettings);
    }
  }
  if (areaName === "local" && changes[SITE_KEY]?.newValue) {
    const prefs = changes[SITE_KEY].newValue as SitePrefs;
    if (prefs.settings) {
      // Domain override was set or updated — apply it
      applySettingsChange(prefs.settings);
    } else {
      // Domain override was cleared — fall back to global
      const global = await getSettings();
      applySettingsChange(global);
    }
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  // When user pressed X, ignore all playback-related messages to prevent UI resurrection
  if (closedManually && [
    "TTS_PROGRESS", "TTS_STREAM_START", "TTS_AUDIO_CHUNK",
    "TTS_STREAM_END", "TTS_SENTENCE_WAV",
    "MODEL_DOWNLOAD_PROGRESS", "MODEL_DOWNLOAD_COMPLETE",
  ].includes(message.type)) {
    return;
  }

  if (message.type === "MODEL_DOWNLOAD_PROGRESS") {
    downloadProgress = { downloaded: message.downloaded, total: message.total };
    updatePlayer();
  }

  if (message.type === "MODEL_DOWNLOAD_COMPLETE") {
    downloadProgress = null;
    updatePlayer();
  }

  if (message.type === "TTS_PROGRESS") {
    loadingStatus = message.status as LoadingStatus;
    if (message.totalChunks) {totalChunks = message.totalChunks;}
    updatePlayer();
  }

  if (message.type === "TTS_STREAM_START") {
    totalChunks = message.totalChunks;
    // Store generation context for regeneration requests
    if (message.sentences) {
      generationSentences = message.sentences as string[];
      sentenceWavData = new Array(totalChunks).fill(null);
      sentenceDurations = new Array(totalChunks).fill(0);
      // Estimate total duration from text length (~14 chars/sec + 0.3s pause per sentence)
      const CHARS_PER_SEC = 14;
      const PAUSE_SEC = 0.3;
      const totalChars = generationSentences.reduce((sum, s) => sum + s.length, 0);
      initialEstimatedDuration = totalChars / CHARS_PER_SEC + generationSentences.length * PAUSE_SEC;
      totalEstimatedDuration = initialEstimatedDuration;
    }
    updatePlayer();
  }

  if (message.type === "TTS_SENTENCE_WAV") {
    const idx = message.index as number;
    const wavData = message.wavData as ArrayBuffer;
    const duration = message.duration as number;

    // Ensure arrays are large enough
    while (sentenceWavData.length <= idx) {sentenceWavData.push(null);}
    while (sentenceDurations.length <= idx) {sentenceDurations.push(0);}

    sentenceWavData[idx] = wavData;
    sentenceDurations[idx] = duration;

    // Update total duration estimate
    totalEstimatedDuration = computeTotalDuration();

    // Update player state
    playerState = {
      ...playerState,
      queueLength: sentenceWavData.filter(d => d !== null).length,
      duration: totalEstimatedDuration,
    };

    // Auto-play sentence 0 when it arrives
    if (idx === 0 && currentSentenceIdx === 0 && !playerState.isPlaying) {
      playCurrentSentence();
      updateHighlight(0);
    }

    // If we were waiting for this sentence (user seeked to it), play it
    if (idx === currentSentenceIdx && !playerState.isPlaying && idx > 0) {
      playCurrentSentence();
    }

    updatePlayer();
  }

  if (message.type === "TTS_AUDIO_CHUNK") {
    updatePlayer();
  }

  if (message.type === "TTS_STREAM_END") {
    isStreaming = false;
    isLoading = false;
    loadingStatus = "done";
    updatePlayer();
  }

  // Another tab started reading — reset local UI only (offscreen handles its own abort)
  if (message.type === "PLAYBACK_INTERRUPTED") {
    closedManually = true;
    isFinished = false;
    cleanupAudioEngine();
    cleanupHighlighting();
    totalChunks = 0;
    isStreaming = false;
    totalElapsedTime = 0;
    totalEstimatedDuration = 0;
  initialEstimatedDuration = 0;
    playerState = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      currentIndex: 0,
      queueLength: 0,
    };
    isLoading = false;
    downloadProgress = null;
    updatePlayer();
  }

  // Handle "Open Settings" from context menu
  if (message.type === "OPEN_SETTINGS") {
    openSettingsRequested = true;
    showPlayer();
  }

  // Handle extension toggle from background
  if (message.type === "EXTENSION_TOGGLE") {
    extensionEnabled = message.enabled;
    saveSitePrefs({ enabled: message.enabled });
    if (!extensionEnabled) {
      hideSelectionButton();
      destroyPlayer();
    } else {
      showPlayer();
    }
  }
});

document.addEventListener("mouseup", (e) => {
  if (!extensionEnabled) {return;}

  const target = e.target as HTMLElement;
  if (
    target.closest("#unmute-selection-button") ||
    target.closest("#unmute-player") ||
    target.closest("#unmute-highlight-overlay")
  ) {
    return;
  }

  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (text && text.length > 0) {
    selectedText = text;
    showSelectionButton(e.clientX, e.clientY);
  } else {
    hideSelectionButton();
  }
});

document.addEventListener("mousedown", (e) => {
  const target = e.target as HTMLElement;
  if (
    !target.closest("#unmute-selection-button") &&
    !target.closest("#unmute-player") &&
    !target.closest("#unmute-highlight-overlay")
  ) {
    if (!isLoading && !isStreaming && !playerState.isPlaying) {
      hideSelectionButton();
    }
  }
});

// Click-to-seek: click on page text to jump to that sentence.
// Uses pre-computed sentence rects (absolute page coordinates) so the index
// always matches the highlight/audio arrays, regardless of text processing.
function getSentenceIndexAtPoint(clientX: number, clientY: number): number {
  if (sentenceRectsCache.length === 0) {return -1;}

  const pageX = clientX + window.scrollX;
  const pageY = clientY + window.scrollY;

  for (let i = 0; i < sentenceRectsCache.length; i++) {
    const rects = sentenceRectsCache[i];
    for (const r of rects) {
      if (pageX >= r.x && pageX <= r.x + r.width &&
          pageY >= r.y && pageY <= r.y + r.height) {
        return i;
      }
    }
  }
  return -1;
}

document.addEventListener("click", (e) => {
  if (!extensionEnabled) {return;}
  const hasAudio = playerState.queueLength > 0;
  if ((!hasAudio && !isLoading && !isStreaming) || sentences.length === 0) {return;}

  const target = e.target as HTMLElement;
  // Skip clicks on our UI or interactive elements
  if (target.closest("#unmute-player, #unmute-selection-button")) {return;}
  if (target.closest("a, button, input, select, textarea, [role='button']")) {return;}

  const idx = getSentenceIndexAtPoint(e.clientX, e.clientY);
  if (idx >= 0) {
    // Show loading highlight if seeking to an unloaded sentence
    if (!sentenceWavData[idx] && highlightingEnabled && highlightOverlay) {
      const rects = sentenceRectsCache[idx];
      if (rects && rects.length > 0) {
        currentHighlightBoxes.forEach(box => box.remove());
        currentHighlightBoxes = [];
        currentHighlightIndex = idx;
        const sx = window.scrollX;
        const sy = window.scrollY;
        for (const r of rects) {
          const box = document.createElement("div");
          box.style.cssText = `
            position: absolute;
            left: ${r.x - sx}px;
            top: ${r.y - sy}px;
            width: ${r.width}px;
            height: ${r.height}px;
            background-color: ${highlightColor};
            border-radius: 3px;
            pointer-events: none;
            animation: unmute-pulse-opacity 1.5s ease-in-out infinite;
          `;
          highlightOverlay.appendChild(box);
          currentHighlightBoxes.push(box);
        }
      }
    }
    handleSeekToSentence(idx);
  }
});

// Keyboard shortcuts (only active when player has audio or is loading)
const SPEED_OPTIONS = [0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2];

document.addEventListener("keydown", (e) => {
  if (!extensionEnabled) {return;}

  // Don't capture when user is typing in an input/textarea/contenteditable.
  // Use composedPath() to see through shadow DOM boundaries — e.target is
  // the shadow host but composedPath()[0] is the actual focused element.
  const realTarget = e.composedPath()[0] as HTMLElement;
  if (realTarget) {
    const rtTag = realTarget.tagName;
    if (rtTag === "INPUT" || rtTag === "TEXTAREA" || rtTag === "SELECT" ||
        realTarget.isContentEditable) {
      return;
    }
  }

  const hasAudio = playerState.queueLength > 0 || isLoading || isStreaming;

  // Helper: capture key so it doesn't reach the page
  const capture = () => { e.preventDefault(); e.stopPropagation(); };

  // Alt+R — start reading selected text or main page content
  if (e.key === "r" && e.altKey && !hasAudio) {
    capture();
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      selectedText = sel;
      handleRead();
    } else {
      const main = detectMainContent();
      if (main) {
        selectedText = main;
        handleRead();
      }
    }
    return;
  }

  if (e.key === "Escape" && hasAudio) {
    capture();
    stopPlayback();
    return;
  }

  if (e.key === " " && hasAudio) {
    capture();
    if (playerState.isPlaying) {
      handleLocalPause();
    } else {
      handleLocalPlay();
    }
    return;
  }

  if (e.key === "ArrowLeft" && hasAudio) {
    capture();
    handleSkipBack();
    return;
  }

  if (e.key === "ArrowRight" && hasAudio) {
    capture();
    handleSkipForward();
    return;
  }

  if (e.key === "ArrowUp" && hasAudio) {
    capture();
    let idx = SPEED_OPTIONS.findIndex(s => s >= currentSpeed);
    if (idx === -1) {idx = SPEED_OPTIONS.length - 1;}
    else if (SPEED_OPTIONS[idx] === currentSpeed && idx < SPEED_OPTIONS.length - 1) {idx++;}
    handleLocalSetSpeed(SPEED_OPTIONS[idx]);
    return;
  }

  if (e.key === "ArrowDown" && hasAudio) {
    capture();
    let idx = SPEED_OPTIONS.length - 1;
    while (idx > 0 && SPEED_OPTIONS[idx] > currentSpeed) {idx--;}
    if (SPEED_OPTIONS[idx] === currentSpeed && idx > 0) {idx--;}
    handleLocalSetSpeed(SPEED_OPTIONS[idx]);
    return;
  }

});

// Init: load per-domain prefs and global settings, then show player
async function init() {
  // Only run on HTML pages (skip PDFs, images, XML, etc.)
  if (document.contentType && !document.contentType.startsWith("text/html")) {return;}

  // Load global settings
  const settings = await getSettings();
  currentTheme = settings.theme || "dark";
  currentSpeed = settings.speed;

  // Load per-domain preferences
  const result = await chrome.storage.local.get(SITE_KEY);
  sitePrefs = result[SITE_KEY] || {};

  if (sitePrefs.enabled === false) {
    extensionEnabled = false;
    return;
  }

  // Estimate page reading time from main content
  estimatePageDuration();

  showPlayer();

  // Re-estimate after full load (SPAs may populate content late)
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => {
      if (!isLoading && !isStreaming) {
        estimatePageDuration();
        updatePlayer();
      }
    }, { once: true });
  }
}

function estimatePageDuration() {
  const CHARS_PER_SEC = 14;
  const text = detectMainContent();
  if (text && text.length > 0) {
    totalEstimatedDuration = text.length / CHARS_PER_SEC;
  }
}

init();
console.log("unmute.page content script loaded");
