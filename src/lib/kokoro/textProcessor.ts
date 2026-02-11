import { tokenize } from "./tokenizer";
import type { LangId } from "@/lib/resources";
import { phonemize } from "@/lib/phonemizer";

export interface TextChunk {
  type: "text";
  content: string;
  tokens: number[];
}

export interface SilenceChunk {
  type: "silence";
  durationSeconds: number;
}

export type TextProcessorChunk = TextChunk | SilenceChunk;

/**
 * Replace punctuation and newlines with silence markers.
 */
export function sanitizeText(rawText: string): string {
  const sanitizedText = rawText
    .replace(/\.\s+/g, "[0.2s]") // Dot followed by whitespace(s).
    .replace(/,\s+/g, "[0.1s]") // Comma followed by whitespace(s).
    .replace(/;\s+/g, "[0.2s]") // Semicolon followed by whitespace(s).
    .replace(/:\s+/g, "[0.15s]") // Colon followed by whitespace(s).
    .replace(/!\s+/g, "![0.05s]") // Exclamation mark followed by whitespace(s).
    .replace(/\?\s+/g, "?[0.05s]") // Question mark followed by whitespace(s).
    .replace(/\n+/g, "[0.2s]")
    .trim();

  return sanitizedText;
}

/**
 * Splits the sanitized string into segments using silence markers as delimiters.
 */
export function segmentText(sanitizedText: string): string[] {
  const regex = /(\[[0-9]+(?:\.[0-9]+)?s\])/g;
  return sanitizedText
    .split(regex)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * Verifies that the token count of a phonemized text does not exceed the limit.
 * If it does, the segment is split into smaller parts.
 */
function createPhonemeSubChunks(
  phonemes: string,
  tokensPerChunk: number
): string[] {
  if (phonemes.length <= tokensPerChunk) {return [phonemes];}

  const chunks: string[] = [];

  let currentChunk: string = "";
  for (const phoneme of phonemes) {
    if (currentChunk.length >= tokensPerChunk) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += phoneme;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Main preprocessText function:
 * 1. Sanitizes the input text.
 * 2. Segments the sanitized text into parts (text and silence markers).
 * 3. For non-silence segments, tokenizes them.
 * 4. Enforces the token limit on each tokenized segment.
 *
 * @param text - Original input text.
 * @param lang - Language for phonemization.
 * @param tokensPerChunk - Maximum allowed tokens per segment.
 * @returns Array of TextProcessorChunk.
 */
export async function preprocessText(
  text: string,
  lang: LangId | string,
  tokensPerChunk: number
): Promise<TextProcessorChunk[]> {
  const chunks: TextProcessorChunk[] = [];
  const sanitized = sanitizeText(text);
  const segments = segmentText(sanitized);

  for (const segment of segments) {
    if (isSilenceMarker(segment)) {
      const durationSeconds = extractSilenceDuration(segment);
      chunks.push({ type: "silence", durationSeconds });
      continue;
    }

    const phonemized = await phonemize(segment, lang);
    const phonemizedChunks = createPhonemeSubChunks(phonemized, tokensPerChunk);

    for (const phonemeChunk of phonemizedChunks) {
      const tokens = tokenize(phonemeChunk);
      chunks.push({ type: "text", content: phonemeChunk, tokens });
    }
  }

  return chunks;
}

/**
 * Checks whether a segment is a silence marker.
 * Accepts only the "[number s]" format (e.g. "[1.5s]").
 */
export function isSilenceMarker(segment: string): boolean {
  return /^\[[0-9]+(?:\.[0-9]+)?s\]$/.test(segment.trim());
}

/**
 * Extracts the duration from a silence marker.
 * Accepts only the "[number s]" format.
 *
 * @param marker - The silence marker string.
 * @returns The duration in seconds.
 */
export function extractSilenceDuration(marker: string): number {
  const match = marker.trim().match(/^\[([0-9]+(?:\.[0-9]+)?)s\]$/);
  return match ? parseFloat(match[1]) : 0;
}
