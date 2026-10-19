// Pre-renders the landing page demo audio with Kokoro (same ONNX model as the extension),
// so the site can play real voices without downloading the 326 MB model in the visitor's browser.
//
// One-off setup (kokoro-js stays out of the extension's dependencies):
//   npm install --prefix tmp/kokoro-gen kokoro-js@1
//   node scripts/generate-site-audio.mjs
//
// Writes site/public/audio/<voice>/<index>.mp3, site/public/audio/preview/<voice>.mp3 and
// site/src/demo/audio-manifest.json (clip durations). Needs ffmpeg on PATH.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatorDir = resolve(root, process.argv[2] ?? "tmp/kokoro-gen");
const audioDir = join(root, "site/public/audio");
const workDir = join(root, "tmp/site-audio-wav");
const script = JSON.parse(readFileSync(join(root, "site/src/demo/sentences.json"), "utf8"));

const requireFromGenerator = createRequire(join(generatorDir, "package.json"));
const { KokoroTTS } = await import(pathToFileURL(requireFromGenerator.resolve("kokoro-js")).href);

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "fp32",
  device: "cpu",
});

function spokenText(sentence, accent) {
  if (!sentence.spoken) {
    return sentence.text;
  }
  return typeof sentence.spoken === "string" ? sentence.spoken : sentence.spoken[accent];
}

/** Synthesises one clip and encodes it as mono MP3; returns its duration in seconds. */
async function renderClip(text, voice, outFile) {
  const audio = await tts.generate(text, { voice, speed: 1 });
  const wavFile = join(workDir, "clip.wav");
  writeFileSync(wavFile, Buffer.from(audio.toWav()));
  mkdirSync(dirname(outFile), { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wavFile, "-ac", "1", "-b:a", "64k", outFile]);
  return Number((audio.audio.length / audio.sampling_rate).toFixed(3));
}

rmSync(audioDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const manifest = { voices: {}, previews: {} };
for (const [voice, { accent }] of Object.entries(script.voices)) {
  manifest.voices[voice] = [];
  for (const [index, sentence] of script.sentences.entries()) {
    const duration = await renderClip(spokenText(sentence, accent), voice, join(audioDir, voice, `${index}.mp3`));
    manifest.voices[voice].push(duration);
    console.log(`${voice} #${index} ${duration}s`);
  }
}
for (const voice of script.previewVoices) {
  manifest.previews[voice] = await renderClip(script.previewText, voice, join(audioDir, "preview", `${voice}.mp3`));
  console.log(`preview ${voice}`);
}

writeFileSync(join(root, "site/src/demo/audio-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Done.");
