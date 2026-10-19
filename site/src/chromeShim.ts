// A stand-in for the few `chrome.*` APIs the player and settings panel use, so the
// extension's real components run on the landing page. Storage lives in memory;
// runtime messages are answered by handlers the demo registers.

type Listener<Args extends unknown[]> = (...args: Args) => void;
type Message = { type: string; [key: string]: unknown };
type MessageHandler = (message: Message) => unknown;
type StorageChangeListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void;

function listenerSet<Args extends unknown[]>() {
  const listeners = new Set<Listener<Args>>();
  return {
    listeners,
    event: {
      addListener: (listener: Listener<Args>) => listeners.add(listener),
      removeListener: (listener: Listener<Args>) => listeners.delete(listener),
      hasListener: (listener: Listener<Args>) => listeners.has(listener),
    },
  };
}

const messageListeners = listenerSet<[Message, unknown, (response?: unknown) => void]>();
const storageListeners = listenerSet<Parameters<StorageChangeListener>>();
const messageHandlers = new Map<string, MessageHandler>();

function storageArea(areaName: "sync" | "local") {
  const data = new Map<string, unknown>();
  return {
    async get(keys?: string | string[] | null) {
      const wanted = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of wanted) {
        if (data.has(key)) {
          result[key] = structuredClone(data.get(key));
        }
      }
      return result;
    },
    async set(items: Record<string, unknown>) {
      const changes: Record<string, { newValue?: unknown }> = {};
      for (const [key, value] of Object.entries(items)) {
        data.set(key, structuredClone(value));
        changes[key] = { newValue: structuredClone(value) };
      }
      storageListeners.listeners.forEach((listener) => listener(changes, areaName));
    },
    async remove(keys: string | string[]) {
      const changes: Record<string, { newValue?: unknown }> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        data.delete(key);
        changes[key] = {};
      }
      storageListeners.listeners.forEach((listener) => listener(changes, areaName));
    },
  };
}

/** Answer `chrome.runtime.sendMessage({ type })` with `handler`'s return value. */
export function handleMessage(type: string, handler: MessageHandler): void {
  messageHandlers.set(type, handler);
}

/** Deliver a message to `chrome.runtime.onMessage` listeners, as background/offscreen would. */
export function broadcast(message: Message): void {
  messageListeners.listeners.forEach((listener) => listener(message, {}, () => {}));
}

export function onStorageChanged(listener: StorageChangeListener): void {
  storageListeners.event.addListener(listener);
}

export function installChromeShim(): void {
  const shim = {
    runtime: {
      lastError: undefined,
      onMessage: messageListeners.event,
      sendMessage(message: Message, callback?: (response: unknown) => void) {
        const response = messageHandlers.get(message.type)?.(message);
        Promise.resolve(response).then((value) => callback?.(value));
        return Promise.resolve(response);
      },
    },
    storage: {
      sync: storageArea("sync"),
      local: storageArea("local"),
      onChanged: storageListeners.event,
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = shim;
}
