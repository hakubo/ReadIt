import type { VoiceId } from "@/lib/resources";
import type { VoiceWeight } from "./combineVoices";

/**
 * Parses a voice formula into an array of voice weights.
 *
 * The formula must follow the pattern:
 *    voice1*weight1 + voice2*weight2 + ... + voiceN*weightN
 *
 * - Voice IDs may include alphanumeric characters, hyphens (-) and underscores (_).
 * - Each weight must be a number between 0 and 1, rounded to the nearest 0.1.
 * - If a single voice is provided without an asterisk, it is assumed to have weight 1.
 *
 * @param {string} formula - The voice formula, e.g. "voice1*0.3 + voice-2*0.7".
 * @returns {VoiceWeight[]} An array of objects with voiceId and weight.
 * @throws {Error} If the formula is empty, contains invalid characters or format,
 *                 or if the sum of weights does not equal 1.
 */
export function parseVoiceFormula(formula: string): VoiceWeight[] {
  // Remove all whitespace characters.
  formula = formula.replace(/\s+/g, "");
  if (formula === "") {
    throw new Error("Voice or voice formula cannot be empty");
  }

  // Allowed characters:
  //   voice IDs: alphanumeric, hyphen (-), underscore (_)
  //   weight: digits, period, asterisk
  //   plus sign for separating terms
  const allowedChars = /^[A-Za-z0-9\-_.*+]+$/;
  if (!allowedChars.test(formula)) {
    throw new Error(
      "Invalid formula. Only alphanumeric characters, hyphens (-), underscores (_), periods (.), asterisks (*) and plus signs (+) are allowed"
    );
  }

  // Split terms by plus sign.
  const terms = formula.split("+").filter((term) => term !== "");

  // If no plus exists and no asterisk is present, treat as a single voice with full weight.
  if (terms.length === 0 && !formula.includes("*")) {
    return [{ voiceId: formula, weight: 1 }];
  }

  // If exactly one term without an asterisk, it's a single voice.
  if (terms.length === 1 && !terms[0].includes("*")) {
    return [{ voiceId: terms[0], weight: 1 }];
  }

  const voices: VoiceWeight[] = [];
  terms.forEach((term, index) => {
    if (!term.includes("*")) {
      throw new Error(
        `Term ${index + 1} ("${term}") is invalid. Each term must contain an asterisk (*) separating voice and weight`
      );
    }
    const parts = term.split("*");
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      throw new Error(
        `Term ${index + 1} ("${term}") format is incorrect. Expected: voice*weight`
      );
    }
    const voiceId = parts[0];
    let weight = parseFloat(parts[1]);
    if (isNaN(weight)) {
      throw new Error(`Weight for voice "${voiceId}" is not a valid number`);
    }
    if (weight < 0 || weight > 1) {
      throw new Error(
        `Weight for voice "${voiceId}" must be between 0 and 1, got ${weight}`
      );
    }
    // Round to the nearest 0.1 for consistency.
    weight = Math.round(weight * 10) / 10;
    voices.push({ voiceId: voiceId as VoiceId, weight });
  });

  const totalWeight = voices.reduce((sum, voice) => sum + voice.weight, 0);
  if (roundToNearest(totalWeight) !== 1) {
    throw new Error(
      `The sum of weights must be exactly 100% but is ${roundToNearest(totalWeight * 100)}%`
    );
  }

  return voices;
}

/**
 * Serializes an array of voice weights back into its formula string representation.
 *
 * The resulting string follows the pattern:
 *    voice1*weight1 + voice2*weight2 + ... + voiceN*weightN
 *
 * @param {VoiceWeight[]} voiceWeights - Array of voice weight objects.
 * @returns {string} The serialized voice formula.
 */
export function serializeVoiceFormula(voiceWeights: VoiceWeight[]): string {
  voiceWeights.sort((a, b) => b.weight - a.weight);

  voiceWeights = voiceWeights.filter((vw) => vw.weight > 0);
  return voiceWeights
    .map((vw) => `${vw.voiceId}*${roundToNearest(vw.weight)}`)
    .join(" + ");
}

function roundToNearest(num: number): number {
  return Math.round(num * 10) / 10;
}
