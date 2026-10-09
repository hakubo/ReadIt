import { createRoot, type Root } from "react-dom/client";
import { DebugPanel, DEBUG_PANEL_STYLES } from "./DebugPanel";
import type { DebugSnapshot } from "./debugData";
import type { DebugConfig } from "./debugConfig";

const HOST_ID = "readit-debug-panel";

interface DebugPanelOptions {
  getSnapshot: () => DebugSnapshot;
  getConfig: () => DebugConfig;
  onSeek: (index: number) => void;
}

/**
 * Debug panel for local builds: toggled with Alt+Shift+D or the "Toggle debug
 * panel" context menu item, starts hidden. Returns the toggle. Lives in its
 * own shadow root so page and player styles don't leak in.
 */
export function installDebugPanel(options: DebugPanelOptions): () => void {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  const close = () => {
    root?.unmount();
    host?.remove();
    root = null;
    host = null;
  };

  const open = () => {
    host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = DEBUG_PANEL_STYLES;
    const mountPoint = document.createElement("div");
    shadow.append(style, mountPoint);
    document.documentElement.appendChild(host);
    root = createRoot(mountPoint);
    root.render(<DebugPanel getSnapshot={options.getSnapshot} getConfig={options.getConfig} onSeek={options.onSeek} onClose={close} />);
  };

  const toggle = () => {
    if (host) {
      close();
    } else {
      open();
    }
  };

  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyD") {
      event.preventDefault();
      toggle();
    }
  }, true);
  return toggle;
}
