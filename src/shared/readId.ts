// A read id ties every message of one read together. The content script makes
// one per read and sends it with GENERATE_TTS; offscreen echoes it on every
// TTS_* message and only obeys PLAYER_RESET / ADVANCE_GENERATION /
// REGENERATE_SENTENCE that carry it. That keeps audio from an aborted read out
// of the next one, and keeps one tab from stopping another tab's read.

let readCounter = 0;

/**
 * Unique enough across tabs and reloads. Not crypto.randomUUID: that needs a
 * secure context, and content scripts also run on http:// pages.
 */
export function createReadId(): string {
  readCounter += 1;
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${readCounter}-${randomPart}`;
}

/** True when the message belongs to the given read. A missing read id matches nothing. */
export function isMessageForRead(message: { readId?: unknown }, readId: string | null | undefined): boolean {
  return typeof readId === "string" && readId.length > 0 && message.readId === readId;
}
