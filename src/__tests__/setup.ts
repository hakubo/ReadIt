import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock chrome extension APIs
const storage: Record<string, Record<string, unknown>> = {
  sync: {},
  local: {},
};

function makeStorageArea(area: Record<string, unknown>) {
  return {
    get: vi.fn((keys: string | string[]) => {
      const result: Record<string, unknown> = {};
      const keyList = typeof keys === "string" ? [keys] : keys;
      for (const k of keyList) {
        if (k in area) {
          result[k] = area[k];
        }
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(area, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keyList = typeof keys === "string" ? [keys] : keys;
      for (const k of keyList) {
        delete area[k];
      }
      return Promise.resolve();
    }),
  };
}

const chrome = {
  storage: {
    sync: makeStorageArea(storage.sync),
    local: makeStorageArea(storage.local),
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: null,
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
  },
};

vi.stubGlobal("chrome", chrome);
