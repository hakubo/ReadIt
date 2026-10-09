// Keyboard shortcut resolution, kept free of extension state so it can be tested.

export type ShortcutAction =
  | "read"
  | "stop"
  | "togglePlay"
  | "skipBack"
  | "skipForward"
  | "speedUp"
  | "speedDown";

export interface ShortcutContext {
  /** A read is loading, streaming, or has audio that hasn't finished playing. */
  hasActiveRead: boolean;
  /** The element picker is open; Escape belongs to it. */
  pickerActive: boolean;
}

export const SPEED_OPTIONS = [0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2];

const INTERACTIVE_TAGS = new Set(["BUTTON", "INPUT", "TEXTAREA", "SELECT", "AUDIO", "VIDEO"]);
const INTERACTIVE_ROLES = new Set(["slider", "textbox", "spinbutton"]);

const PLAYBACK_KEYS: Record<string, ShortcutAction> = {
  " ": "togglePlay",
  ArrowLeft: "skipBack",
  ArrowRight: "skipForward",
  ArrowUp: "speedUp",
  ArrowDown: "speedDown",
};

/** True when the element handles keys itself (typing, sliders, media, buttons). */
export function isInteractiveTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (INTERACTIVE_TAGS.has(target.tagName)) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  // jsdom doesn't implement isContentEditable, so also check the attribute.
  if (target.closest("[contenteditable]:not([contenteditable='false'])")) {
    return true;
  }
  const role = target.getAttribute("role");
  return role !== null && INTERACTIVE_ROLES.has(role);
}

function hasAnyModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

/** Alt+R only. `e.code` because on macOS Option+R produces e.key "®". */
function isReadShortcut(event: KeyboardEvent): boolean {
  return event.code === "KeyR" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/**
 * Map a keydown to a shortcut action, or null when the page should keep the key.
 * The target is the real (composed) target so focus inside Shadow DOM is seen.
 */
export function resolveShortcut(
  event: KeyboardEvent,
  target: EventTarget | null | undefined,
  context: ShortcutContext,
): ShortcutAction | null {
  if (isInteractiveTarget(target)) {
    return null;
  }
  if (isReadShortcut(event)) {
    return context.hasActiveRead ? null : "read";
  }
  if (hasAnyModifier(event) || !context.hasActiveRead) {
    return null;
  }
  if (event.key === "Escape") {
    return context.pickerActive ? null : "stop";
  }
  return PLAYBACK_KEYS[event.key] ?? null;
}

/** Next speed option above the current speed (stays at the top). */
export function nextSpeedUp(currentSpeed: number): number {
  const higher = SPEED_OPTIONS.find((speed) => speed > currentSpeed);
  return higher ?? SPEED_OPTIONS[SPEED_OPTIONS.length - 1];
}

/** Next speed option below the current speed (stays at the bottom). */
export function nextSpeedDown(currentSpeed: number): number {
  const lower = [...SPEED_OPTIONS].reverse().find((speed) => speed < currentSpeed);
  return lower ?? SPEED_OPTIONS[0];
}
