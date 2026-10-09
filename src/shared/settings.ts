import { DEFAULT_SETTINGS, DEFAULT_TEXT_REPLACEMENTS, DEFAULT_NOISE_SELECTORS, type TTSSettings, type SitePrefs } from "./types";

export async function getGlobalSettings(): Promise<TTSSettings> {
  try {
    const result = await chrome.storage.sync.get("settings");
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings as Partial<TTSSettings>) };
    if (!settings.textReplacements) {settings.textReplacements = DEFAULT_TEXT_REPLACEMENTS;}
    if (!settings.noiseSelectors) {settings.noiseSelectors = DEFAULT_NOISE_SELECTORS;}
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
    const prefs = result[key] as SitePrefs | undefined;
    if (!prefs?.settings) {return null;}
    // Defaults first: overrides saved before a setting existed don't have it
    const settings = { ...DEFAULT_SETTINGS, ...prefs.settings };
    if (!settings.textReplacements) {settings.textReplacements = DEFAULT_TEXT_REPLACEMENTS;}
    if (!settings.noiseSelectors) {settings.noiseSelectors = DEFAULT_NOISE_SELECTORS;}
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
  const prefs = (result[key] as SitePrefs | undefined) ?? ({} as SitePrefs);
  prefs.settings = settings;
  await chrome.storage.local.set({ [key]: prefs });
}

/** Noise selectors picked on this site (SitePrefs.noiseSelectors). */
export async function getSiteNoiseSelectors(hostname: string): Promise<string[]> {
  try {
    const key = `site:${hostname}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as SitePrefs | undefined)?.noiseSelectors ?? [];
  } catch {
    return [];
  }
}

export async function saveSiteNoiseSelectors(hostname: string, selectors: string[]): Promise<void> {
  const key = `site:${hostname}`;
  const result = await chrome.storage.local.get(key);
  const prefs = (result[key] as SitePrefs | undefined) ?? ({} as SitePrefs);
  prefs.noiseSelectors = selectors;
  await chrome.storage.local.set({ [key]: prefs });
}

export async function clearDomainSettings(hostname: string): Promise<void> {
  const key = `site:${hostname}`;
  const result = await chrome.storage.local.get(key);
  const prefs = result[key] as SitePrefs | undefined;
  if (prefs) {
    delete prefs.settings;
    await chrome.storage.local.set({ [key]: prefs });
  }
}
