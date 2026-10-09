import { describe, it, expect } from "vitest";
import {
  resolveShortcut,
  isInteractiveTarget,
  nextSpeedUp,
  nextSpeedDown,
  type ShortcutContext,
} from "@/content/keyboardShortcuts";

const READING: ShortcutContext = { hasActiveRead: true, pickerActive: false };
const IDLE: ShortcutContext = { hasActiveRead: false, pickerActive: false };

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

function element(html: string): Element {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container.firstElementChild as Element;
}

describe("resolveShortcut", () => {
  const body = document.body;

  it("starts a read with Alt+R using e.code (macOS gives key '®')", () => {
    expect(resolveShortcut(key({ key: "®", code: "KeyR", altKey: true }), body, IDLE)).toBe("read");
  });

  it("ignores Alt+R while a read is active", () => {
    expect(resolveShortcut(key({ key: "r", code: "KeyR", altKey: true }), body, READING)).toBeNull();
  });

  it("ignores Alt+R combined with other modifiers", () => {
    expect(resolveShortcut(key({ code: "KeyR", altKey: true, metaKey: true }), body, IDLE)).toBeNull();
    expect(resolveShortcut(key({ code: "KeyR", altKey: true, ctrlKey: true }), body, IDLE)).toBeNull();
    expect(resolveShortcut(key({ code: "KeyR", altKey: true, shiftKey: true }), body, IDLE)).toBeNull();
  });

  it("maps playback keys during a read", () => {
    expect(resolveShortcut(key({ key: " " }), body, READING)).toBe("togglePlay");
    expect(resolveShortcut(key({ key: "ArrowLeft" }), body, READING)).toBe("skipBack");
    expect(resolveShortcut(key({ key: "ArrowRight" }), body, READING)).toBe("skipForward");
    expect(resolveShortcut(key({ key: "ArrowUp" }), body, READING)).toBe("speedUp");
    expect(resolveShortcut(key({ key: "ArrowDown" }), body, READING)).toBe("speedDown");
    expect(resolveShortcut(key({ key: "Escape" }), body, READING)).toBe("stop");
  });

  it("leaves playback keys to the page when no read is active", () => {
    expect(resolveShortcut(key({ key: " " }), body, IDLE)).toBeNull();
    expect(resolveShortcut(key({ key: "ArrowLeft" }), body, IDLE)).toBeNull();
    expect(resolveShortcut(key({ key: "Escape" }), body, IDLE)).toBeNull();
  });

  it("does not hijack modified arrows (Cmd/Alt/Ctrl/Shift+Arrow)", () => {
    expect(resolveShortcut(key({ key: "ArrowLeft", metaKey: true }), body, READING)).toBeNull();
    expect(resolveShortcut(key({ key: "ArrowRight", altKey: true }), body, READING)).toBeNull();
    expect(resolveShortcut(key({ key: "ArrowUp", ctrlKey: true }), body, READING)).toBeNull();
    expect(resolveShortcut(key({ key: "ArrowDown", shiftKey: true }), body, READING)).toBeNull();
    expect(resolveShortcut(key({ key: " ", shiftKey: true }), body, READING)).toBeNull();
  });

  it("leaves Escape to the element picker while it is open", () => {
    const context = { hasActiveRead: true, pickerActive: true };
    expect(resolveShortcut(key({ key: "Escape" }), body, context)).toBeNull();
    expect(resolveShortcut(key({ key: " " }), body, context)).toBe("togglePlay");
  });

  it("ignores keys aimed at interactive elements", () => {
    const button = element("<button>Go</button>");
    expect(resolveShortcut(key({ key: " " }), button, READING)).toBeNull();
    expect(resolveShortcut(key({ code: "KeyR", altKey: true }), button, IDLE)).toBeNull();
  });
});

describe("isInteractiveTarget", () => {
  it.each([
    "<button>b</button>",
    "<input>",
    "<textarea></textarea>",
    "<select><option>a</option></select>",
    "<audio></audio>",
    "<video></video>",
    "<div contenteditable='true'>x</div>",
    "<div role='slider'></div>",
    "<div role='textbox'></div>",
    "<div role='spinbutton'></div>",
  ])("treats %s as interactive", (html) => {
    expect(isInteractiveTarget(element(html))).toBe(true);
  });

  it("treats a child of a contenteditable region as interactive", () => {
    const editor = element("<div contenteditable><p><b>bold</b></p></div>");
    expect(isInteractiveTarget(editor.querySelector("b"))).toBe(true);
  });

  it("treats plain content as not interactive", () => {
    expect(isInteractiveTarget(element("<p>text</p>"))).toBe(false);
    expect(isInteractiveTarget(element("<div contenteditable='false'>x</div>"))).toBe(false);
    expect(isInteractiveTarget(document.body)).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});

describe("speed steps", () => {
  it("steps up and down through the options", () => {
    expect(nextSpeedUp(1)).toBe(1.2);
    expect(nextSpeedUp(1.1)).toBe(1.2);
    expect(nextSpeedUp(2)).toBe(2);
    expect(nextSpeedDown(1)).toBe(0.8);
    expect(nextSpeedDown(1.1)).toBe(1);
    expect(nextSpeedDown(0.6)).toBe(0.6);
  });
});
