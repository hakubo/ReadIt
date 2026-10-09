import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerKeepAwakeCleanup, setTabKeepAwake } from "@/background/keepAwake";

let sessionStore: Record<string, unknown>;
const requestKeepAwake = vi.fn();
const releaseKeepAwake = vi.fn();

beforeEach(() => {
  sessionStore = {};
  requestKeepAwake.mockClear();
  releaseKeepAwake.mockClear();
  vi.stubGlobal("chrome", {
    power: { requestKeepAwake, releaseKeepAwake },
    storage: {
      session: {
        get: async (key: string) => ({ [key]: sessionStore[key] }),
        set: async (items: Record<string, unknown>) => { Object.assign(sessionStore, items); },
      },
    },
  });
});

describe("setTabKeepAwake", () => {
  it("keeps the screen on while any tab is reading", async () => {
    await setTabKeepAwake(1, true);
    await setTabKeepAwake(2, true);
    await setTabKeepAwake(1, false);
    expect(requestKeepAwake).toHaveBeenLastCalledWith("display");
    expect(releaseKeepAwake).not.toHaveBeenCalled();
  });

  it("releases once the last tab stops", async () => {
    await setTabKeepAwake(1, true);
    await setTabKeepAwake(1, false);
    expect(releaseKeepAwake).toHaveBeenCalledTimes(1);
    expect(sessionStore.keepAwakeTabs).toEqual([]);
  });
});

describe("keep-awake update ordering", () => {
  beforeEach(() => {
    // Slow storage, so overlapping updates would interleave their read-modify-write.
    vi.stubGlobal("chrome", {
      power: { requestKeepAwake, releaseKeepAwake },
      storage: {
        session: {
          get: async (key: string) => {
            const snapshot = { [key]: sessionStore[key] };
            await new Promise((resolve) => setTimeout(resolve, 5));
            return snapshot;
          },
          set: async (items: Record<string, unknown>) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            Object.assign(sessionStore, items);
          },
        },
      },
    });
  });

  it("applies overlapping updates in order", async () => {
    await Promise.all([setTabKeepAwake(1, true), setTabKeepAwake(1, false)]);
    expect(sessionStore.keepAwakeTabs).toEqual([]);
    expect(releaseKeepAwake).toHaveBeenCalledTimes(1);
    expect(requestKeepAwake).toHaveBeenCalledTimes(1);
  });

  it("keeps both tabs when they start at the same time", async () => {
    await Promise.all([setTabKeepAwake(1, true), setTabKeepAwake(2, true)]);
    expect(sessionStore.keepAwakeTabs).toEqual([1, 2]);
  });
});

describe("registerKeepAwakeCleanup", () => {
  it("ignores loads of tabs that never asked to stay awake", async () => {
    let onUpdated: (tabId: number, changeInfo: { status?: string }) => void = () => {};
    const set = vi.fn(async (items: Record<string, unknown>) => { Object.assign(sessionStore, items); });
    vi.stubGlobal("chrome", {
      power: { requestKeepAwake, releaseKeepAwake },
      storage: {
        session: {
          get: async (key: string) => ({ [key]: sessionStore[key] }),
          set,
        },
      },
      tabs: {
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: (fn: typeof onUpdated) => { onUpdated = fn; } },
      },
    });
    registerKeepAwakeCleanup();
    await setTabKeepAwake(1, true);
    set.mockClear();

    onUpdated(2, { status: "loading" });
    await setTabKeepAwake(1, true); // queued after the cleanup, so that has run
    expect(set).toHaveBeenCalledTimes(1);

    onUpdated(1, { status: "loading" });
    await vi.waitFor(() => expect(sessionStore.keepAwakeTabs).toEqual([]));
    expect(releaseKeepAwake).toHaveBeenCalled();
  });
});
