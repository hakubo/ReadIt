//@ts-expect-error no types for espeak-ng
import ESpeakNg from "espeak-ng";
import { langsMap, type LangId } from "@/lib/resources";

// The WASM file bundled with the extension (never a CDN: the Chrome Web
// Store forbids remotely hosted code). Relative outside the extension (tests).
function getEspeakWasmUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("espeak-ng.wasm");
  }
  return "espeak-ng.wasm";
}

// Cache the compiled WebAssembly.Module so we only compile the WASM binary once.
// WebAssembly compilation (binary → native code) is the expensive step.
// Instantiation from a pre-compiled module (memory allocation + import linking) is much cheaper.
let cachedWasmModule: WebAssembly.Module | null = null;

async function getWasmModule(): Promise<WebAssembly.Module> {
  if (cachedWasmModule) {
    return cachedWasmModule;
  }
  const response = await fetch(getEspeakWasmUrl());
  if (!response.ok) {
    throw new Error(
      `Failed to fetch espeak WASM binary: ${response.status} ${response.statusText}`,
    );
  }
  const wasmBinary = await response.arrayBuffer();
  cachedWasmModule = await WebAssembly.compile(wasmBinary);
  return cachedWasmModule;
}

interface EspeakExports {
  memory: WebAssembly.Memory;
  stackSave(): number;
  stackRestore(pointer: number): void;
  stackAlloc(size: number): number;
  __main_argc_argv(argc: number, argv: number): number;
}

interface EspeakModule {
  FS: {
    readFile(path: string, options: { encoding: "utf8" }): string;
    unlink(path: string): void;
  };
}

interface EspeakInstance {
  module: EspeakModule;
  exports: EspeakExports;
  // Linear memory right after the C runtime initialised, before main() ran.
  pristineMemory: Uint8Array;
}

const PROGRAM_NAME = "./this.program";
const OUTPUT_FILE = "generated";

let espeakInstancePromise: Promise<EspeakInstance> | null = null;

/**
 * Creates one espeak-ng instance without running main(). The espeak CLI
 * keeps global state between runs (e.g. getopt's `optind`): a second plain
 * main() call just repeats the first call's output. Instead the linear memory
 * is snapshotted here and restored before every run, which puts the C side
 * back into exactly the state a fresh instance would have.
 */
async function createEspeakInstance(): Promise<EspeakInstance> {
  const wasmModule = await getWasmModule();
  const captured: { exports?: EspeakExports } = {};

  // instantiateWasm reuses the pre-compiled module and gives us the raw
  // exports (stackAlloc, main), which the Emscripten glue doesn't expose.
  const module: EspeakModule = await ESpeakNg({
    noInitialRun: true,
    // espeak reads stdin when it gets no text argument. Emscripten's default
    // browser stdin is window.prompt("Input:"), which pops a dialog on the
    // user's page. Report end-of-input instead.
    stdin: () => null,
    instantiateWasm(
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance) => void,
    ) {
      WebAssembly.instantiate(wasmModule, imports).then((instance) => {
        captured.exports = instance.exports as unknown as EspeakExports;
        successCallback(instance);
      });
      return {};
    },
  });

  if (!captured.exports) {
    throw new Error("espeak-ng initialised without WASM exports");
  }
  const pristineMemory = new Uint8Array(captured.exports.memory.buffer).slice();
  return { module, exports: captured.exports, pristineMemory };
}

function getEspeakInstance(): Promise<EspeakInstance> {
  if (!espeakInstancePromise) {
    espeakInstancePromise = createEspeakInstance();
    espeakInstancePromise.catch(() => {
      espeakInstancePromise = null;
    });
  }
  return espeakInstancePromise;
}

/** Copies NUL-terminated UTF-8 strings onto the WASM stack and builds argv. */
function writeArgv(exports: EspeakExports, args: string[]): number {
  const encoder = new TextEncoder();
  const stringPointers = args.map((arg) => {
    const bytes = encoder.encode(`${arg}\0`);
    const pointer = exports.stackAlloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, pointer);
    return pointer;
  });

  const argvPointer = exports.stackAlloc((stringPointers.length + 1) * 4);
  const heap32 = new Uint32Array(exports.memory.buffer);
  stringPointers.forEach((pointer, index) => {
    heap32[(argvPointer >> 2) + index] = pointer;
  });
  heap32[(argvPointer >> 2) + stringPointers.length] = 0;
  return argvPointer;
}

/** Runs espeak's main() on a reset instance, like a fresh process would. */
function runEspeakMain(instance: EspeakInstance, args: string[]): void {
  const { exports } = instance;
  // The buffer may have grown during an earlier run; only the snapshot's
  // prefix matters because restoring it also resets the heap break pointer.
  new Uint8Array(exports.memory.buffer).set(instance.pristineMemory);

  const stackPointer = exports.stackSave();
  try {
    const argv = [PROGRAM_NAME, ...args];
    exports.__main_argc_argv(argv.length, writeArgv(exports, argv));
  } finally {
    exports.stackRestore(stackPointer);
  }
}

function resolveLang(langId: LangId | string) {
  for (const key of Object.keys(langsMap)) {
    if (key === langId) {
      return langsMap[langId as LangId];
    }
  }
  return langsMap["en-us"];
}

/**
 * phonemize converts text to phonemes and returns
 * the phonemized text in the specified language.
 *
 * it uses espeak-ng to generate the phonemes.
 *
 * @param text
 * @param lang
 * @returns
 */
export async function phonemize(
  text: string,
  langId: LangId | string,
): Promise<string> {
  const lang = resolveLang(langId);
  const normalized = normalizeText(text);
  if (!normalized.trim()) {
    return "";
  }
  const espeakArgs = [
    "--phonout",
    OUTPUT_FILE,
    "-q",
    "--ipa",
    "-v",
    lang.id,
    asPositionalArgument(normalized),
  ];

  const instance = await getEspeakInstance();
  // Restore, run and read are synchronous, so concurrent callers can't
  // interleave on the shared instance.
  try {
    runEspeakMain(instance, espeakArgs);
    const generated = instance.module.FS.readFile(OUTPUT_FILE, {
      encoding: "utf8",
    });
    // The JS file system isn't part of the memory snapshot. Remove the output
    // so a run that writes nothing fails like it would on a fresh instance
    // instead of returning the previous text's phonemes.
    instance.module.FS.unlink(OUTPUT_FILE);
    return generated.split("\n").join(" ").trim();
  } catch (error) {
    // Don't reuse an instance that aborted mid-run (e.g. exit() or a trap).
    espeakInstancePromise = null;
    throw error;
  }
}

/**
 * espeak's option parser treats an argument starting with "-" as a flag, so
 * a sentence like "-Dave" would be swallowed as an unknown option and espeak
 * would fall back to reading stdin. A leading space keeps it as text and
 * doesn't change the phonemes.
 */
function asPositionalArgument(text: string): string {
  return text.startsWith("-") ? ` ${text}` : text;
}

/**
 * normalizeText normalizes text to be phonemized.
 *
 * @param text The text to normalize.
 */
function normalizeText(text: string): string {
  return (
    text
      // Quotes and parentheses
      .replaceAll("\u2018", "'") // '
      .replaceAll("\u2019", "'") // '
      .replaceAll("\u00AB", "(") // «
      .replaceAll("\u00BB", ")") // »
      .replaceAll("\u201C", '"') // "
      .replaceAll("\u201D", '"') // "
      // Punctuation
      .replace(/\u3001/g, ", ") // 、
      .replace(/\u3002/g, ". ") // 。
      .replace(/\uFF01/g, "! ") // ！
      .replace(/\uFF0C/g, ", ") // ，
      .replace(/\uFF1A/g, ": ") // ：
      .replace(/\uFF1B/g, "; ") // ；
      .replace(/\uFF1F/g, "? ") // ？
      // Spaces
      .replaceAll("\n", "  ")
      .replaceAll("\t", "  ")
      .trim()
  );
}
