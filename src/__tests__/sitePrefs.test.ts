import { describe, it, expect, beforeEach } from "vitest";
import {
  updateSitePrefs,
  saveDomainSettings,
  saveSiteNoiseSelectors,
  clearDomainSettings,
} from "@/shared/settings";
import { DEFAULT_SETTINGS } from "@/shared/types";

const KEY = "site:example.com";

beforeEach(async () => {
  await chrome.storage.local.remove(KEY);
});

async function storedPrefs(): Promise<Record<string, unknown>> {
  return (await chrome.storage.local.get(KEY))[KEY] as Record<string, unknown>;
}

describe("updateSitePrefs", () => {
  it("keeps a dismissal another tab saved after this tab loaded", async () => {
    // This tab loaded with no prefs; another tab then dismissed the extension.
    await chrome.storage.local.set({ [KEY]: { enabled: false } });

    await updateSitePrefs("example.com", { playerPosition: { x: 10, y: 20 } });

    expect(await storedPrefs()).toEqual({ enabled: false, playerPosition: { x: 10, y: 20 } });
  });

  it("keeps both fields when two updates are sent back to back", async () => {
    const first = updateSitePrefs("example.com", { playerPosition: { x: 1, y: 2 } });
    const second = updateSitePrefs("example.com", { playerMinimized: true });
    await Promise.all([first, second]);

    expect(await storedPrefs()).toEqual({ playerPosition: { x: 1, y: 2 }, playerMinimized: true });
  });

  it("removes a field when updated to undefined", async () => {
    await chrome.storage.local.set({ [KEY]: { enabled: false, contentSelector: "article" } });

    await updateSitePrefs("example.com", { contentSelector: undefined });

    const stored = await storedPrefs();
    expect(stored).toEqual({ enabled: false });
    expect("contentSelector" in stored).toBe(false);
  });

  it("serializes saveDomainSettings, saveSiteNoiseSelectors, and clearDomainSettings with updateSitePrefs", async () => {
    const domainSettings = { ...DEFAULT_SETTINGS, speed: 1.5 };
    await Promise.all([
      saveDomainSettings("example.com", domainSettings),
      saveSiteNoiseSelectors("example.com", [".ad"]),
      updateSitePrefs("example.com", { enabled: false }),
    ]);

    expect(await storedPrefs()).toEqual({
      settings: domainSettings,
      noiseSelectors: [".ad"],
      enabled: false,
    });

    await Promise.all([
      clearDomainSettings("example.com"),
      updateSitePrefs("example.com", { playerMinimized: true }),
    ]);

    const afterClear = await storedPrefs();
    expect(afterClear).toEqual({
      noiseSelectors: [".ad"],
      enabled: false,
      playerMinimized: true,
    });
    expect("settings" in afterClear).toBe(false);
  });
});
