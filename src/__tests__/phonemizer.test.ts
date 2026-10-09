// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
//@ts-expect-error no types for espeak-ng
import ESpeakNg from "espeak-ng";
import { phonemize } from "@/lib/phonemizer";
import {
  sanitizeText,
  segmentText,
  isSilenceMarker,
} from "@/lib/kokoro/textProcessor";

// Copy into a plain Uint8Array: Node's Buffer type isn't accepted as BodyInit.
const wasmBinary = new Uint8Array(
  readFileSync(
    resolve(__dirname, "../../node_modules/espeak-ng/dist/espeak-ng.wasm"),
  ),
);

function wasmResponse(): Response {
  return new Response(wasmBinary, { status: 200 });
}

/**
 * The original phonemize(): a fresh Emscripten instance per call, with the
 * arguments passed to the module so main() runs during instantiation.
 * Kept here as the reference output for the reused-instance implementation.
 */
const compiledWasm = WebAssembly.compile(wasmBinary);

async function legacyPhonemize(text: string, langId: string): Promise<string> {
  const wasmModule = await compiledWasm;
  const espeak = await ESpeakNg({
    instantiateWasm(
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance) => void,
    ) {
      WebAssembly.instantiate(wasmModule, imports).then(successCallback);
      return {};
    },
    arguments: ["--phonout", "generated", "-q", "--ipa", "-v", langId, text],
  });
  const generated = espeak.FS.readFile("generated", { encoding: "utf8" });
  return generated.split("\n").join(" ").trim();
}

const SENTENCES = [
  "Hello there, how are you doing today?",
  "Wait, what? No way!",
  "It costs $1,000, or about 4,321.50 euros, as of 2024.",
  'She said "hello" and then “goodbye”, didn’t she?',
  "The meeting is at 10:30; bring the 3rd-quarter report: pages 1-12.",
  "Dr. Smith (the surgeon) arrived at 5 p.m. on Jan. 3rd!",
  "Numbers: 1, 2, 3, 42, 3.14159, and 1,000,000.",
  "Ugh!!! Really?! Okay… fine.",
  "Line one\nLine two\tand a tab.",
  "A",
];

function segmentsOf(sentence: string): string[] {
  return segmentText(sanitizeText(sentence)).filter(
    (segment) => !isSilenceMarker(segment),
  );
}

// Each legacy call instantiates espeak (~40 ms), so allow more than the default 5 s.
describe("phonemize", { timeout: 60_000 }, () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => wasmResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches the per-call-instance output for every segment", async () => {
    const segments = SENTENCES.flatMap(segmentsOf);
    // Phonemize every segment twice so later calls run on a reused instance.
    for (const segment of [...segments, ...segments]) {
      expect(await phonemize(segment, "en-us")).toBe(
        await legacyPhonemize(segment, "en-us"),
      );
    }
  });

  it("matches the per-call-instance output for whole sentences", async () => {
    for (const sentence of SENTENCES) {
      expect(await phonemize(sentence, "en-us")).toBe(
        await legacyPhonemize(sentence, "en-us"),
      );
    }
  });

  it("matches for other languages and keeps no state between them", async () => {
    const cases: Array<[string, string]> = [
      ["en-gb", "Colour, flavour and 25 litres."],
      ["es-419", "¿Dónde está la biblioteca? Tengo 21 años."],
      ["en-us", "Colour, flavour and 25 litres."],
      ["it", "Buongiorno, mi chiamo Marco!"],
      ["pt-br", "Olá, tudo bem? Custa 15 reais."],
      ["hi", "नमस्ते, आप कैसे हैं?"],
      ["ja", "こんにちは、元気ですか？"],
      ["cmn", "你好，我是学生。"],
      ["en-us", "Back to English after other voices."],
    ];
    for (const [lang, text] of cases) {
      expect(await phonemize(text, lang)).toBe(
        await legacyPhonemize(text, lang),
      );
    }
  });

  it("phonemizes text starting with a dash instead of reading stdin", async () => {
    const promptSpy = vi.fn(() => null);
    vi.stubGlobal("prompt", promptSpy);
    const phonemes = await phonemize("-Dave", "en-us");
    expect(phonemes.length).toBeGreaterThan(0);
    expect(phonemes).toBe(await phonemize("Dave", "en-us"));
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("returns nothing for empty text without running espeak", async () => {
    expect(await phonemize("   ", "en-us")).toBe("");
  });

  it("retries after the WASM fetch fails instead of caching the failure", async () => {
    vi.resetModules();
    const { phonemize: freshPhonemize } = await import("@/lib/phonemizer");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(async () => wasmResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(freshPhonemize("Hello", "en-us")).rejects.toThrow("503");
    expect(await freshPhonemize("Hello", "en-us")).toBe(
      await legacyPhonemize("Hello", "en-us"),
    );
  });
});
