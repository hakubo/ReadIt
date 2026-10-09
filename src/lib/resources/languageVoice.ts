import { gradeRank } from "./quoteVoice";
import { voices, voicesMap } from "./voices";

/** A page's lang attribute ("fr-CA", "en", "pt") -> the voice language id that speaks it, or null. */
export function voiceLanguageFor(language: string): string | null {
  const [base, region = ""] = language.toLowerCase().split("-");
  switch (base) {
    case "en":
      return region === "gb" || region === "uk" ? "en-gb" : "en-us";
    case "es":
      return "es-419";
    case "pt":
      return "pt-br";
    case "zh":
    case "cmn":
      return "cmn";
    case "ja":
    case "hi":
    case "it":
      return base;
    default:
      return null;
  }
}

function baseOf(languageId: string): string {
  return languageId.split("-")[0];
}

/**
 * Voice for text marked with `language`, or null to keep the main voice: when
 * it's the main voice's language (any English for an English voice), or no
 * voice speaks it. Prefers the main voice's gender, then the best grade.
 */
export function resolveLanguageVoice(mainVoiceId: string, language: string | undefined): string | null {
  const main = voicesMap[mainVoiceId as keyof typeof voicesMap];
  const target = language ? voiceLanguageFor(language) : null;
  if (!main || !target || baseOf(target) === baseOf(main.lang.id)) {
    return null;
  }
  const candidates = voices
    .filter(voice => voice.lang.id === target)
    .sort((a, b) => Number(b.gender === main.gender) - Number(a.gender === main.gender) || gradeRank(a) - gradeRank(b));
  return candidates[0]?.id ?? null;
}
