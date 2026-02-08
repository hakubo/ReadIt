import { useState, useEffect, useRef } from "react";
import { X, Play, Loader } from "lucide-react";
import { voices } from "@/lib/resources";
import { HIGHLIGHT_COLORS, DEFAULT_TEXT_REPLACEMENTS, type TTSSettings, type TextReplacementRule } from "@/shared/types";
import {
  getGlobalSettings,
  getDomainSettings,
  saveGlobalSettings,
  saveDomainSettings,
  clearDomainSettings,
} from "@/shared/settings";

async function checkCacheStatus(): Promise<{ modelCached: boolean; cachedVoices: Set<string> }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CHECK_CACHE_STATUS", voiceIds: voices.map(v => v.id) },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve({ modelCached: false, cachedVoices: new Set() });
          return;
        }
        resolve({
          modelCached: response.modelCached,
          cachedVoices: new Set<string>(response.cachedVoices),
        });
      }
    );
  });
}

interface SettingsPanelProps {
  position: { x: number; y: number };
  onClose: () => void;
  domain: string;
  theme: "light" | "dark";
  visible?: boolean;
  onPickContent?: () => void;
  contentSelector?: string;
  onClearContentSelector?: () => void;
  onSetContentSelector?: (selector: string) => void;
  onSelectorFocus?: () => void;
  onSelectorBlur?: () => void;
}

function formatDomain(domain: string): string {
  const d = domain.replace(/^www\./, "");
  return d.length > 28 ? d.slice(0, 26) + "\u2026" : d;
}

export function SettingsPanel({ position, onClose, domain, theme, visible = true, onPickContent, contentSelector, onClearContentSelector, onSetContentSelector, onSelectorFocus, onSelectorBlur }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<"default" | "domain">("default");
  const [globalSettings, setGlobalSettings] = useState<TTSSettings | null>(null);
  const [domainSettings, setDomainSettings] = useState<TTSSettings | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [modelCached, setModelCached] = useState<boolean | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [cachedVoices, setCachedVoices] = useState<Set<string>>(new Set());
  const [downloadingVoice, setDownloadingVoice] = useState<string | null>(null);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [ruleErrors, setRuleErrors] = useState<Set<number>>(new Set());
  const prevVisible = useRef(false);

  // Compute selector match count live (always fresh)
  const selectorMatchCount = (() => {
    if (!contentSelector) {return undefined;}
    try { return document.querySelectorAll(contentSelector).length; } catch { return 0; }
  })();

  useEffect(() => {
    if (visible && !prevVisible.current) {
      (async () => {
        const global = await getGlobalSettings();
        setGlobalSettings(global);
        const ds = await getDomainSettings(domain);
        setDomainSettings(ds);
        if (ds || contentSelector) {setActiveTab("domain");}
      })();
      checkCacheStatus().then(({ modelCached: mc, cachedVoices: cv }) => {
        setModelCached(mc);
        setCachedVoices(cv);
      });
    }
    prevVisible.current = visible;
  }, [visible, domain]);

  // Listen for messages from offscreen/background
  useEffect(() => {
    const listener = (message: { type: string; voiceId?: string; playing?: boolean }) => {
      if (message.type === "PREVIEW_STATE") {
        setPreviewingVoice(message.playing ? message.voiceId! : null);
      }
      if (message.type === "MODEL_DOWNLOAD_PROGRESS") {
        setModelDownloading(true);
      }
      if (message.type === "MODEL_DOWNLOAD_COMPLETE") {
        setModelDownloading(false);
        setModelCached(true);
      }
      if (message.type === "VOICE_DOWNLOAD_START") {
        setDownloadingVoice(message.voiceId!);
      }
      if (message.type === "VOICE_DOWNLOAD_COMPLETE") {
        const voiceId = message.voiceId!;
        setDownloadingVoice(null);
        setCachedVoices(prev => new Set([...prev, voiceId]));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const settings = activeTab === "domain" && domainSettings
    ? domainSettings
    : globalSettings;

  const save = (newSettings: TTSSettings) => {
    if (activeTab === "domain") {
      setDomainSettings(newSettings);
      saveDomainSettings(domain, newSettings);
    } else {
      setGlobalSettings(newSettings);
      saveGlobalSettings(newSettings);
    }
  };

  const handleDomainEdit = (newSettings: TTSSettings) => {
    // First domain edit: create override from global + change
    if (!domainSettings && globalSettings) {
      setDomainSettings(newSettings);
      saveDomainSettings(domain, newSettings);
      return;
    }
    save(newSettings);
  };

  const handleResetDomain = async () => {
    await clearDomainSettings(domain);
    setDomainSettings(null);
    setActiveTab("default");
  };

  const currentSave = activeTab === "domain" ? handleDomainEdit : save;

  const toggleVoice = (voiceId: string) => {
    if (!settings) {return;}
    const current = settings.voices;
    if (current.includes(voiceId)) {
      if (current.length <= 1) {return;}
      currentSave({ ...settings, voices: current.filter(v => v !== voiceId) });
    } else {
      currentSave({ ...settings, voices: [...current, voiceId] });
    }
  };

  const previewVoice = (voiceId: string) => {
    chrome.runtime.sendMessage({ type: "PREVIEW_VOICE", voiceId });
  };

  // Group voices by language
  const voicesByLang = voices.reduce(
    (acc, voice) => {
      const langName = voice.lang.name;
      if (!acc[langName]) {acc[langName] = [];}
      acc[langName].push(voice);
      return acc;
    },
    {} as Record<string, (typeof voices)[number][]>
  );

  const selectedCount = settings?.voices.length ?? 0;

  return (
    <div
      className={`settings-panel${visible ? " visible" : ""}${theme === "light" ? " theme-light" : ""}`}
      style={{
        position: "fixed",
        zIndex: 2147483647,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="settings-close-btn" onClick={onClose}>
          <X size={12} strokeWidth={3} />
        </button>
      </div>

      <div className="settings-tabs">
        <button
          className={`settings-tab${activeTab === "default" ? " active" : ""}`}
          onClick={() => setActiveTab("default")}
        >
          Default
        </button>
        <button
          className={`settings-tab tab-domain${activeTab === "domain" ? " active" : ""}`}
          onClick={() => setActiveTab("domain")}
        >
          {formatDomain(domain)}
          {domainSettings && <span className="settings-tab-dot" />}
        </button>
      </div>

      {!settings ? null : <div className="settings-body">
        <label className="settings-label">Voices ({selectedCount} selected)</label>
        <div className="settings-voice-list">
          {Object.entries(voicesByLang).map(([lang, langVoices]) => (
            <div key={lang}>
              <div className="settings-voice-lang">{lang}</div>
              {langVoices.map((v) => (
                <div key={v.id} className="settings-voice-row">
                  <label className="settings-voice-check">
                    <input
                      type="checkbox"
                      checked={settings.voices.includes(v.id)}
                      onChange={() => toggleVoice(v.id)}
                    />
                    {v.name} ({v.gender})
                  </label>
                  <span className="voice-status-icon">
                    {downloadingVoice === v.id ? (
                      <span className="voice-downloading-icon" title="Downloading\u2026">
                        <Loader size={10} className="spinner" />
                      </span>
                    ) : cachedVoices.has(v.id) ? (
                      <span className="voice-cached-icon" title="Available offline">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                    ) : null}
                  </span>
                  <button
                    className="settings-voice-preview"
                    onClick={() => previewVoice(v.id)}
                    disabled={previewingVoice != null}
                    title={`Preview ${v.name}`}
                  >
                    {previewingVoice === v.id
                      ? <Loader size={12} className="spinner" />
                      : <Play size={12} />}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <label className="settings-label">
          Speed: {settings.speed.toFixed(1)}x
        </label>
        <input
          type="range"
          className="settings-range"
          min="0.6"
          max="2"
          step="0.2"
          value={settings.speed}
          onChange={(e) =>
            currentSave({ ...settings, speed: parseFloat(e.target.value) })
          }
        />

        <div className="settings-toggle-row">
          <span className="settings-label">Highlight sentences</span>
          <button
            className={`settings-toggle ${settings.highlightSentences ? "active" : ""}`}
            onClick={() =>
              currentSave({
                ...settings,
                highlightSentences: !settings.highlightSentences,
              })
            }
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>

        {settings.highlightSentences && (
          <div className="settings-colors">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                className={`settings-color-btn ${settings.highlightColor === c.value ? "active" : ""}`}
                style={{ backgroundColor: c.value.replace(/[\d.]+\)$/, '1)') }}
                onClick={() => currentSave({ ...settings, highlightColor: c.value })}
                title={c.name}
              />
            ))}
          </div>
        )}

        <div className="settings-toggle-row">
          <span className="settings-label">Auto-scroll to sentence</span>
          <button
            className={`settings-toggle ${settings.autoScroll !== false ? "active" : ""}`}
            onClick={() =>
              currentSave({
                ...settings,
                autoScroll: settings.autoScroll === false,
              })
            }
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>

        <div className="settings-toggle-row">
          <span className="settings-label">Dark mode</span>
          <button
            className={`settings-toggle ${settings.theme !== "light" ? "active" : ""}`}
            onClick={() =>
              currentSave({
                ...settings,
                theme: settings.theme === "light" ? "dark" : "light",
              })
            }
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>

        <div className="settings-rules-section">
          <button
            className="settings-rules-toggle"
            onClick={() => setRulesExpanded(!rulesExpanded)}
          >
            <span className={`settings-rules-chevron${rulesExpanded ? " open" : ""}`}>&#9654;</span>
            Text rules ({settings.textReplacements.length})
          </button>
          {rulesExpanded && (
            <>
              <div className="settings-rules-list">
                {settings.textReplacements.map((rule, i) => (
                  <div key={i} className="settings-rule-row">
                    <input
                      className={`settings-rule-input${ruleErrors.has(i) ? " rule-error" : ""}`}
                      type="text"
                      value={rule.pattern}
                      placeholder="Regex pattern"
                      spellCheck={false}
                      onFocus={() => onSelectorFocus?.()}
                      onBlur={(e) => {
                        onSelectorBlur?.();
                        const val = e.target.value;
                        if (!val) { setRuleErrors(prev => { const s = new Set(prev); s.delete(i); return s; }); return; }
                        try { new RegExp(val); setRuleErrors(prev => { const s = new Set(prev); s.delete(i); return s; }); }
                        catch { setRuleErrors(prev => new Set(prev).add(i)); }
                      }}
                      onChange={(e) => {
                        const updated = [...settings.textReplacements];
                        updated[i] = { ...updated[i], pattern: e.target.value };
                        currentSave({ ...settings, textReplacements: updated });
                      }}
                    />
                    <input
                      className="settings-rule-input"
                      type="text"
                      value={rule.replacement}
                      placeholder="Replacement ($1, $2...)"
                      spellCheck={false}
                      onFocus={() => onSelectorFocus?.()}
                      onBlur={() => onSelectorBlur?.()}
                      onChange={(e) => {
                        const updated = [...settings.textReplacements];
                        updated[i] = { ...updated[i], replacement: e.target.value };
                        currentSave({ ...settings, textReplacements: updated });
                      }}
                    />
                    <button
                      className={`settings-rule-btn ${rule.enabled ? "rule-enabled" : "rule-disabled"}`}
                      title={rule.enabled ? "Enabled" : "Disabled"}
                      onClick={() => {
                        const updated = [...settings.textReplacements];
                        updated[i] = { ...updated[i], enabled: !updated[i].enabled };
                        currentSave({ ...settings, textReplacements: updated });
                      }}
                    >
                      {rule.enabled ? "\u25CF" : "\u25CB"}
                    </button>
                    <button
                      className="settings-rule-btn"
                      title="Delete rule"
                      onClick={() => {
                        const updated = settings.textReplacements.filter((_, j) => j !== i);
                        setRuleErrors(prev => {
                          const s = new Set<number>();
                          prev.forEach(idx => { if (idx < i) {s.add(idx);} else if (idx > i) {s.add(idx - 1);} });
                          return s;
                        });
                        currentSave({ ...settings, textReplacements: updated });
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="settings-rule-add-btn"
                onClick={() => {
                  const newRule: TextReplacementRule = { pattern: "", replacement: "", flags: "gi", enabled: true };
                  currentSave({ ...settings, textReplacements: [...settings.textReplacements, newRule] });
                }}
              >
                + Add rule
              </button>
              <button
                className="settings-rule-reset-btn"
                onClick={() => {
                  setRuleErrors(new Set());
                  currentSave({ ...settings, textReplacements: DEFAULT_TEXT_REPLACEMENTS });
                }}
              >
                Reset to defaults
              </button>
            </>
          )}
        </div>

        {activeTab === "default" && modelCached !== null && (
          <div className="settings-diagnostics">
            <label className="settings-label">Status</label>
            <div className="settings-diag-row">
              <span className={`diag-dot ${modelDownloading ? "downloading" : modelCached ? "ready" : ""}`} />
              <span>TTS model</span>
              <span className="diag-value">{modelDownloading ? "Downloading\u2026" : modelCached ? "Cached" : "Not downloaded"}</span>
            </div>
          </div>
        )}

        {activeTab === "domain" && (
          <>
            <label className="settings-label">Content area</label>
            <div className="settings-content-selector">
              <input
                className={`settings-selector-input${selectorMatchCount !== undefined && selectorMatchCount !== 1 && contentSelector ? " selector-warn" : ""}`}
                type="text"
                value={contentSelector || ""}
                placeholder="CSS selector"
                spellCheck={false}
                onChange={(e) => onSetContentSelector?.(e.target.value)}
                onFocus={() => onSelectorFocus?.()}
                onBlur={() => onSelectorBlur?.()}
                onKeyDown={(e) => { if (e.key === "Enter") {(e.target as HTMLInputElement).blur();} }}
              />
              <button className="settings-selector-btn" onClick={onPickContent} title="Pick element">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="3" />
                  <path d="M11 2v3" /><path d="M11 19v3" />
                  <path d="M2 11h3" /><path d="M19 11h3" />
                  <path d="M18.364 5.636l-2.121 2.121" />
                  <path d="M7.757 16.243l-2.121 2.121" />
                  <path d="M5.636 5.636l2.121 2.121" />
                  <path d="M16.243 16.243l2.121 2.121" />
                </svg>
              </button>
              {contentSelector && (
                <button className="settings-selector-btn" onClick={onClearContentSelector} title="Clear">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {contentSelector && selectorMatchCount !== undefined && selectorMatchCount !== 1 && (
              <div className="selector-warning">
                {selectorMatchCount === 0
                  ? "No elements match this selector"
                  : `Matches ${selectorMatchCount} elements (should be 1)`}
              </div>
            )}
          </>
        )}

        {activeTab === "domain" && domainSettings && (
          <button className="settings-reset-btn" onClick={handleResetDomain}>
            Reset to defaults
          </button>
        )}
      </div>}
    </div>
  );
}
