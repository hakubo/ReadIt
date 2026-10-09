import { voices, voicesMap, type Voice } from "./voices";

// "auto" picks a contrasting voice, "off" reads quotes in the main voice,
// anything else is a voice id.
export const QUOTE_VOICE_AUTO = "auto";
export const QUOTE_VOICE_OFF = "off";

const GRADE_ORDER = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F+", "F", "F-"];

/** Position of the voice's quality grade, best first. */
export function gradeRank(voice: Voice): number {
  const rank = GRADE_ORDER.indexOf(voice.overallGrade);
  return rank < 0 ? GRADE_ORDER.length : rank;
}

/** Best-graded voice matching `filter`, or null. */
function bestVoice(filter: (voice: Voice) => boolean): Voice | null {
  const candidates = voices.filter(filter).sort((a, b) => gradeRank(a) - gradeRank(b));
  return candidates[0] ?? null;
}

/**
 * Voice for quoted text, or null to use the main voice. "auto" prefers the
 * best voice of the other gender in the main voice's language, so a quote is
 * clearly a different speaker, then any other voice in that language.
 */
export function resolveQuoteVoice(mainVoiceId: string, preference: string | undefined): string | null {
  if (preference === QUOTE_VOICE_OFF) {
    return null;
  }
  if (preference && preference !== QUOTE_VOICE_AUTO) {
    return preference in voicesMap ? preference : null;
  }
  const main = voicesMap[mainVoiceId as keyof typeof voicesMap];
  if (!main) {
    return null;
  }
  const sameLanguage = (voice: Voice) => voice.lang.id === main.lang.id && voice.id !== main.id;
  const contrasting = bestVoice(voice => sameLanguage(voice) && voice.gender !== main.gender)
    ?? bestVoice(sameLanguage);
  return contrasting?.id ?? null;
}
