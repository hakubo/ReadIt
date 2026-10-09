// Rewrites written forms the way an English speaker says them, before the
// text reaches espeak (which reads symbols literally: "euros fifty", "two
// thousand twenty four dash zero one dash fifteen", "World War roman two").
// The highlight index never sees this text, so it can change freely.

import { voicesMap } from "@/lib/resources/voices";
import { speakRanges } from "../textProcessing";
import { speakCurrencies } from "./currency";
import { speakDates, type DateOrder } from "./dates";
import { speakNumberShapes } from "./numbers";
import { speakRomanNumerals } from "./roman";
import { speakUnits } from "./units";

export interface SpokenFormsOptions {
  dateOrder: DateOrder;
}

/** "Settings → Privacy" -> "Settings, Privacy" (espeak says "right arrow"). */
function speakArrows(text: string): string {
  return text.replace(/\s*(?:→|⇒|➜|➔|⟶|->|=>)\s*/g, ", ");
}

/**
 * English only: the words added ("euros", "January", "to") would be wrong
 * for other voices. American voices say "January 15th, 2024" and read an
 * ambiguous "01/02/2024" as January 2nd; British ones say "2nd January 2024"
 * and read it as 1 February.
 */
export function spokenFormsForVoice(voiceId: string | undefined): SpokenFormsOptions | null {
  const language = voiceId ? voicesMap[voiceId as keyof typeof voicesMap]?.lang.id : undefined;
  if (language === "en-us") {
    return { dateOrder: "MDY" };
  }
  if (language === "en-gb") {
    return { dateOrder: "DMY" };
  }
  return null;
}

/** Order matters: dates before ranges ("2024-01-15" isn't a range), money before the user's "$" rule. */
export function speakWrittenForms(text: string, options: SpokenFormsOptions): string {
  const withDates = speakDates(text, options.dateOrder);
  const withMoney = speakCurrencies(withDates);
  const withNumbers = speakNumberShapes(speakRanges(withMoney));
  return speakArrows(speakRomanNumerals(speakUnits(withNumbers)));
}
