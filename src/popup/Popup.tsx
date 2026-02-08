import { useState, useEffect } from "react";
import { Play, Loader } from "lucide-react";
import { voices } from "@/lib/resources";
import { HIGHLIGHT_COLORS, type TTSSettings } from "@/shared/types";
import {
  getGlobalSettings,
  getDomainSettings,
  saveGlobalSettings,
  saveDomainSettings,
  clearDomainSettings,
} from "@/shared/settings";

function formatDomain(domain: string): string {
  const d = domain.replace(/^www\./, "");
  return d.length > 18 ? d.slice(0, 16) + "\u2026" : d;
}

export function Popup() {
  const [activeTab, setActiveTab] = useState<"default" | "domain">("default");
  const [globalSettings, setGlobalSettings] = useState<TTSSettings | null>(null);
  const [domainSettings, setDomainSettings] = useState<TTSSettings | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Get active tab domain
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs[0]?.url;
      let hostname: string | null = null;
      if (url) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            hostname = parsed.hostname;
          }
        } catch { /* ignore invalid URLs */ }
      }
      setDomain(hostname);

      const global = await getGlobalSettings();
      setGlobalSettings(global);

      if (hostname) {
        const ds = await getDomainSettings(hostname);
        setDomainSettings(ds);
        if (ds) {setActiveTab("domain");}
      }
    })();
  }, []);

  // Listen for PREVIEW_STATE messages from offscreen
  useEffect(() => {
    const listener = (message: { type: string; voiceId: string; playing: boolean }) => {
      if (message.type === "PREVIEW_STATE") {
        setPreviewingVoice(message.playing ? message.voiceId : null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const settings = activeTab === "domain" && domainSettings
    ? domainSettings
    : globalSettings;

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const save = (newSettings: TTSSettings) => {
    if (activeTab === "domain" && domain) {
      setDomainSettings(newSettings);
      saveDomainSettings(domain, newSettings);
    } else {
      setGlobalSettings(newSettings);
      saveGlobalSettings(newSettings);
    }
    showSaved();
  };

  const handleDomainEdit = (newSettings: TTSSettings) => {
    if (!domainSettings && globalSettings && domain) {
      setDomainSettings(newSettings);
      saveDomainSettings(domain, newSettings);
      showSaved();
      return;
    }
    save(newSettings);
  };

  const handleResetDomain = async () => {
    if (!domain) {return;}
    await clearDomainSettings(domain);
    setDomainSettings(null);
    setActiveTab("default");
    showSaved();
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

  if (!settings) {return null;}

  const selectedCount = settings.voices.length;

  return (
    <div className="w-80 bg-gray-900 p-4 text-white">
      <h1 className="mb-3 text-lg font-semibold">Kokoro TTS Settings</h1>

      {/* Tab bar */}
      <div className="mb-4 flex border-b border-gray-700">
        <button
          className={`flex-1 pb-2 text-center text-sm transition-colors ${
            activeTab === "default"
              ? "border-b-2 border-blue-500 text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
          onClick={() => setActiveTab("default")}
        >
          Default
        </button>
        <button
          className={`flex-1 pb-2 text-center text-sm transition-colors ${
            activeTab === "domain"
              ? "border-b-2 border-blue-500 text-white"
              : "text-gray-500 hover:text-gray-300"
          } ${!domain ? "cursor-not-allowed opacity-40" : ""}`}
          onClick={() => domain && setActiveTab("domain")}
          disabled={!domain}
        >
          <span className="inline-flex items-center gap-1.5">
            {domain ? formatDomain(domain) : "No site"}
            {domainSettings && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
            )}
          </span>
        </button>
      </div>

      <div className="space-y-4">
        {/* Voice selection */}
        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Voices ({selectedCount} selected)
          </label>
          <div className="max-h-52 overflow-y-auto rounded border border-gray-700 bg-gray-800">
            {Object.entries(voicesByLang).map(([langName, langVoices]) => (
              <div key={langName}>
                <div className="sticky top-0 z-10 bg-gray-800 px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {langName}
                </div>
                {langVoices.map((voice) => (
                  <div
                    key={voice.id}
                    className="flex items-center justify-between px-2 py-0.5 hover:bg-gray-700/50"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.voices.includes(voice.id)}
                        onChange={() => toggleVoice(voice.id)}
                        className="accent-blue-500"
                      />
                      {voice.name} ({voice.gender})
                    </label>
                    <button
                      onClick={() => previewVoice(voice.id)}
                      disabled={previewingVoice != null}
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      title={`Preview ${voice.name}`}
                    >
                      {previewingVoice === voice.id
                        ? <Loader size={12} className="animate-spin" />
                        : <Play size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Speed slider */}
        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Speed: {settings.speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.speed}
            onChange={(e) => currentSave({ ...settings, speed: parseFloat(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-700 accent-blue-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>0.5x</span>
            <span>1x</span>
            <span>2x</span>
          </div>
        </div>

        {/* Highlight sentences toggle */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">
            Highlight sentences
          </label>
          <button
            onClick={() => currentSave({ ...settings, highlightSentences: !settings.highlightSentences })}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              settings.highlightSentences ? "bg-blue-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                settings.highlightSentences ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {/* Highlight color picker */}
        {settings.highlightSentences && (
          <div>
            <label className="mb-2 block text-sm text-gray-400">
              Highlight Color
            </label>
            <div className="flex gap-2">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => currentSave({ ...settings, highlightColor: color.value })}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    settings.highlightColor === color.value
                      ? "border-white scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Reset to defaults */}
        {activeTab === "domain" && domainSettings && (
          <button
            onClick={handleResetDomain}
            className="w-full rounded border border-gray-700 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
          >
            Reset to defaults
          </button>
        )}

        {/* Save indicator */}
        {saved && (
          <div className="text-center text-sm text-green-400">
            Settings saved!
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-gray-700 pt-4 text-center text-xs text-gray-500">
        Select text on any page and click "Read" to listen
      </div>
    </div>
  );
}
