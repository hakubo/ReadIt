import { afterEach, describe, expect, it } from "vitest";
import { findReadHints } from "../content/readHints";
import { expandAbbreviations, firstAbbreviationUses } from "../shared/abbreviations";
import { resolveLanguageVoice, voiceLanguageFor } from "../lib/resources/languageVoice";
import { voicesMap } from "../lib/resources/voices";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("lang");
});

describe("findReadHints", () => {
  it("marks sentences inside an element in another language", () => {
    document.documentElement.lang = "en";
    document.body.innerHTML = `<main><p>Hello there.</p><p lang="es">Hola amigo. Qué tal?</p><p>Bye.</p></main>`;
    const hints = findReadHints(["Hello there.", "Hola amigo.", "Qué tal?", "Bye."], document.querySelector("main"));
    expect(hints.pageLanguage).toBe("en");
    expect(hints.sentenceLanguages).toEqual({ 1: "es", 2: "es" });
  });

  it("uses the innermost language and ignores regional variants of the page language", () => {
    document.body.innerHTML = `<main lang="en-US"><div lang="it"><p>Ciao.</p><p lang="ja">こんにちは。</p></div><p lang="en-GB">Colour.</p></main>`;
    const hints = findReadHints(["Ciao.", "こんにちは。", "Colour."], document.querySelector("main"));
    expect(hints.pageLanguage).toBe("en-US");
    expect(hints.sentenceLanguages).toEqual({ 0: "it", 1: "ja" });
  });

  it("collects abbreviation titles", () => {
    document.body.innerHTML = `<main><p>The <abbr title="Application Programming Interface">API</abbr> and <abbr title="API">API</abbr> and <abbr>CSS</abbr>.</p></main>`;
    expect(findReadHints([], document.querySelector("main")).abbreviations).toEqual({ API: "Application Programming Interface" });
  });
});

describe("abbreviations", () => {
  const titles = { API: "Application Programming Interface", UI: "user interface" };

  it("expands only the first sentence that uses each abbreviation, as a whole word", () => {
    const sentences = ["Intro.", "The API is new.", "Our UI uses the API.", "GUI only."];
    const uses = firstAbbreviationUses(sentences, titles);
    expect(uses).toEqual(new Map([[1, ["API"]], [2, ["UI"]]]));
    expect(expandAbbreviations(sentences[1], uses.get(1)!, titles)).toBe("The Application Programming Interface (API) is new.");
    expect(expandAbbreviations(sentences[2], uses.get(2)!, titles)).toBe("Our user interface (UI) uses the API.");
  });
});

describe("language voices", () => {
  it("maps lang attributes to voice languages", () => {
    expect(voiceLanguageFor("fr-CA")).toBeNull();
    expect(voiceLanguageFor("es-MX")).toBe("es-419");
    expect(voiceLanguageFor("en-GB")).toBe("en-gb");
    expect(voiceLanguageFor("zh-Hans")).toBe("cmn");
  });

  it("keeps the main voice for its own language or an unsupported one", () => {
    expect(resolveLanguageVoice("af_heart", "en-GB")).toBeNull();
    expect(resolveLanguageVoice("af_heart", "pl")).toBeNull();
    expect(resolveLanguageVoice("af_heart", undefined)).toBeNull();
  });

  it("picks a voice of the same gender in the other language when there is one", () => {
    const voiceId = resolveLanguageVoice("af_heart", "it")!;
    const voice = voicesMap[voiceId as keyof typeof voicesMap];
    expect(voice.lang.id).toBe("it");
    expect(voice.gender).toBe("Female");
  });
});
