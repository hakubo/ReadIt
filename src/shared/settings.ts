import { DEFAULT_SETTINGS, DEFAULT_TEXT_REPLACEMENTS, type TTSSettings, type SitePrefs } from "./types";

export async function getGlobalSettings(): Promise<TTSSettings> {
  try {
    const result = await chrome.storage.sync.get("settings");
    const settings = { ...DEFAULT_SETTINGS, ...result.settings };
    if (!settings.textReplacements) {settings.textReplacements = DEFAULT_TEXT_REPLACEMENTS;}
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function getDomainSettings(
  hostname: string
): Promise<TTSSettings | null> {
  try {
    const key = `site:${hostname}`;
    const result = await chrome.storage.local.get(key);
    const prefs: SitePrefs | undefined = result[key];
    if (!prefs?.settings) {return null;}
    const settings = { ...prefs.settings };
    if (!settings.textReplacements) {settings.textReplacements = DEFAULT_TEXT_REPLACEMENTS;}
    return settings;
  } catch {
    return null;
  }
}

export async function getEffectiveSettings(
  hostname: string
): Promise<TTSSettings> {
  const domain = await getDomainSettings(hostname);
  if (domain) {return domain;}
  return getGlobalSettings();
}

export async function saveGlobalSettings(settings: TTSSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}

export async function saveDomainSettings(
  hostname: string,
  settings: TTSSettings
): Promise<void> {
  const key = `site:${hostname}`;
  const result = await chrome.storage.local.get(key);
  const prefs: SitePrefs = result[key] || {};
  prefs.settings = settings;
  await chrome.storage.local.set({ [key]: prefs });
}

export async function clearDomainSettings(hostname: string): Promise<void> {
  const key = `site:${hostname}`;
  const result = await chrome.storage.local.get(key);
  const prefs: SitePrefs = result[key];
  if (prefs) {
    delete prefs.settings;
    await chrome.storage.local.set({ [key]: prefs });
  }
}
