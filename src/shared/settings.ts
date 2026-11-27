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

export function saveDomainSettings(
  hostname: string,
  settings: TTSSettings
): Promise<void> {
  return updateSitePrefs(hostname, { settings });
}

// Chains this context's site-pref writes so two quick updates (drag, then
// minimize, or a setting change right before a dismissal) can't both read the
// same old value and drop each other's field.
let sitePrefsWriteQueue: Promise<unknown> = Promise.resolve();

/**
 * Merge updates into the stored prefs for a site. Reads storage instead of
 * trusting an in-memory copy: another tab on the same site may have changed
 * other fields (e.g. `enabled`) since this one loaded. An `undefined` value
 * removes that field.
 */
export function updateSitePrefs(hostname: string, updates: Partial<SitePrefs>): Promise<void> {
  const key = `site:${hostname}`;
  const write = sitePrefsWriteQueue.then(async () => {
    const result = await chrome.storage.local.get(key);
    const stored = (result[key] as SitePrefs | undefined) ?? {};
    const next: SitePrefs = { ...stored, ...updates };
    for (const field of Object.keys(updates) as (keyof SitePrefs)[]) {
      if (updates[field] === undefined) {
        delete next[field];
      }
    }
    await chrome.storage.local.set({ [key]: next });
  });
  sitePrefsWriteQueue = write.catch(() => {});
  return write;
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

export function saveSiteNoiseSelectors(hostname: string, selectors: string[]): Promise<void> {
  return updateSitePrefs(hostname, { noiseSelectors: selectors });
}

export function clearDomainSettings(hostname: string): Promise<void> {
  const key = `site:${hostname}`;
  const write = sitePrefsWriteQueue.then(async () => {
    const result = await chrome.storage.local.get(key);
    const prefs = result[key] as SitePrefs | undefined;
    if (prefs) {
      const next = { ...prefs };
      delete next.settings;
      await chrome.storage.local.set({ [key]: next });
    }
  });
  sitePrefsWriteQueue = write.catch(() => {});
  return write;
}
