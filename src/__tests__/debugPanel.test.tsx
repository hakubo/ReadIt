import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { installDebugPanel } from "../content/debug/mountDebugPanel";
import type { DebugSnapshot } from "../content/debug/debugData";
import type { DebugConfig } from "../content/debug/debugConfig";

const snapshot: DebugSnapshot = {
  readId: "read-123456789",
  flags: { loading: false, streaming: true, playing: true, finished: false, closed: false },
  currentIndex: 0,
  generatingIndex: 1,
  startTiming: null,
  sentences: [
    { index: 0, text: "First.", status: "playing", quoted: false, located: "found", durationSec: 1.2,
      report: { synthesisMs: 300, spokenText: "First.", voiceId: "af_heart", failed: false } },
    { index: 1, text: "Second.", status: "generating", quoted: true, located: "pending", durationSec: null, report: null },
  ],
  events: [{ atMs: 12, type: "read started", detail: "" }],
};

const config: DebugConfig = {
  content: { kind: "detected", root: null, textLength: 1234 },
  savedContentSelector: null,
  rules: [{ rule: { pattern: "(\\d)k", replacement: "$1 thousand", flags: "gi", enabled: true }, matches: 2 }],
  noise: [
    { selector: "nav", pickedOnSite: false, pageMatches: 3 },
    { selector: "div[", pickedOnSite: true, pageMatches: null },
  ],
};

function panelText(): string {
  return document.getElementById("readit-debug-panel")?.shadowRoot?.textContent ?? "";
}

describe("debug panel", () => {
  it("opens and closes with the toggle and renders the sentence table", async () => {
    const onSeek = vi.fn();
    const toggle = installDebugPanel({ getSnapshot: () => snapshot, getConfig: () => config, onSeek });

    await act(async () => toggle());
    expect(panelText()).toContain("Read it!");
    expect(panelText()).toContain("Gen speed");
    expect(panelText()).toContain("Second.");
    expect(panelText()).toContain("streaming");
    expect(panelText()).toContain("playing");

    await act(async () => toggle());
    expect(document.getElementById("readit-debug-panel")).toBeNull();
  });

  it("shows content area, text rules and noise selectors on the Config tab", async () => {
    const toggle = installDebugPanel({ getSnapshot: () => snapshot, getConfig: () => config, onSeek: vi.fn() });
    await act(async () => toggle());
    const shadow = document.getElementById("readit-debug-panel")!.shadowRoot!;
    const configButton = Array.from(shadow.querySelectorAll("button")).find((button) => button.textContent === "Config")!;
    await act(async () => configButton.click());
    expect(panelText()).toContain("1,234 chars");
    expect(panelText()).toContain("2×");
    expect(panelText()).toContain("(picked on site)");
    expect(panelText()).toContain("invalid");
    await act(async () => toggle());
  });

  it("minimizes to a pill showing the position and expands again", async () => {
    const toggle = installDebugPanel({ getSnapshot: () => snapshot, getConfig: () => config, onSeek: vi.fn() });
    await act(async () => toggle());
    const shadow = document.getElementById("readit-debug-panel")!.shadowRoot!;
    await act(async () => (shadow.querySelector("button[title='Minimize']") as HTMLElement).click());
    expect(shadow.querySelector(".pill")?.textContent).toContain("1/2");
    await act(async () => (shadow.querySelector(".pill") as HTMLElement).click());
    expect(shadow.querySelector(".panel")).not.toBeNull();
    await act(async () => toggle());
  });

  it("opens on Alt+Shift+D", async () => {
    installDebugPanel({ getSnapshot: () => snapshot, getConfig: () => config, onSeek: vi.fn() });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", altKey: true, shiftKey: true }));
    });
    expect(document.getElementById("readit-debug-panel")).not.toBeNull();
  });
});
