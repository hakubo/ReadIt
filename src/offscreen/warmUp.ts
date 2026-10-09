// Warm-up before the user presses Play: load the model, then run one tiny
// sentence so the phonemizer, the voice file and (on WebGPU) the compiled
// shaders are ready. The first real sentence then only pays for its own
// inference.

import { generateVoice, isSessionCached, preloadModel } from "@/lib/kokoro";
import { isModelCached, voicesMap } from "@/lib/resources";

const WARM_UP_TEXT = "Hi.";

const warmedVoices = new Set<string>();
let pendingWarmUp: Promise<void> | null = null;

async function runWarmUp(voiceId: string, isBusy: () => boolean): Promise<void> {
  // The first 326 MB download shows progress in the player, which only a real
  // read does, so never start it silently from a warm-up.
  if (!isSessionCached() && !(await isModelCached())) {
    return;
  }
  await preloadModel();
  // A read that started meanwhile warms everything up itself
  if (isBusy() || warmedVoices.has(voiceId)) {
    return;
  }
  const lang = voicesMap[voiceId as keyof typeof voicesMap]?.lang?.id || "en-us";
  await generateVoice({ text: WARM_UP_TEXT, lang, voiceId });
  warmedVoices.add(voiceId);
}

/** Start a warm-up for `voiceId` unless one is running or it's already warm. Never rejects. */
export function warmUp(voiceId: string, isBusy: () => boolean): Promise<void> {
  if (pendingWarmUp) {
    return pendingWarmUp;
  }
  if (isSessionCached() && warmedVoices.has(voiceId)) {
    return Promise.resolve();
  }
  pendingWarmUp = runWarmUp(voiceId, isBusy)
    .catch((error: unknown) => console.warn("[Read it!] Warm-up failed:", error))
    .finally(() => {
      pendingWarmUp = null;
    });
  return pendingWarmUp;
}

/** Wait for a running warm-up, so a read never runs inference alongside it. */
export function waitForWarmUp(): Promise<void> {
  return pendingWarmUp ?? Promise.resolve();
}

export function isWarmingUp(): boolean {
  return pendingWarmUp !== null;
}
