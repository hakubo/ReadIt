// A sentence with no letters or digits (e.g. a lone emoji, "—", "•") gives the
// TTS model nothing to say. Generating it fails and playback waits forever for
// a WAV that never arrives, so such sentences are skipped or replaced by silence.
const SPEAKABLE_CHARACTER = /[\p{L}\p{N}]/u;

export function hasSpeakableText(text: string): boolean {
  return SPEAKABLE_CHARACTER.test(text);
}
