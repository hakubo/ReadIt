# Read it!

Free, local text-to-speech voice reader for Chrome.

A Chrome extension that adds text-to-speech to any webpage. Select text, click "Read", and listen — powered by [Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), running 100% locally in your browser.

If you find this project useful, consider supporting its development:

<a href="https://www.buymeacoffee.com/jakubolek" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40"></a>

## Features

- 54 natural-sounding AI voices
- Sentence-by-sentence highlighting with auto-scroll
- Adjustable playback speed (0.6x–2.0x)
- Per-site content selector and settings
- Light/dark theme
- Fully private — your text never leaves your browser (only the model and voices are downloaded, once)

## Install

```bash
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension at `chrome://extensions`.

## Development

```bash
npm run dev       # dev server
npm run lint      # check for errors
npm run lint:fix  # auto-fix
npm run test      # run tests
```

## Architecture

The extension is split into isolated contexts that communicate via Chrome's message-passing API:

```
Content Script (page) ←→ Background (service worker) ←→ Offscreen Document (TTS)
    ↓            ↕ postMessage                                     ↓
Floating UI   Player iframe (player.html)                    ONNX inference
(Shadow DOM)  Audio playback                                 WAV creation
```

### Content Script

Injected into every page. Handles text selection, displays the floating player UI inside a Shadow DOM (to avoid CSS conflicts with the host page), manages sentence highlighting with auto-scroll, and extracts text from the page using configurable content selectors. Audio plays in a hidden `player.html` iframe served from the extension origin, so the host page's CSP can't block it.

### Background Service Worker

Acts as the central message router between the content script and the offscreen document. Manages the offscreen document lifecycle (creating it on demand, warming it up before Play, closing it when idle) and checks cache status for downloaded models and voices.

### Offscreen Document

Where the actual TTS work happens. Runs ONNX Runtime (with WebAssembly) to perform Kokoro model inference, and generates audio WAV buffers from text (playback happens in the content script's player iframe). Uses a windowed generation strategy — it pre-generates up to 15 sentences ahead and accepts priority requests when the user seeks to an ungenerated sentence.

### Resource Caching

The Kokoro model (~326 MB) and voice files are downloaded from Hugging Face on first use and stored via the browser's Cache API. Subsequent runs load entirely from cache, so the extension works offline after the initial download.

## Acknowledgments

This project would not be possible without the following open-source projects:

- **[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)** by Hexgrad — A lightweight, high-quality text-to-speech model with 82M parameters that produces natural-sounding speech across 54 voices. Kokoro is the heart of this extension.
- **[ONNX Runtime Web](https://onnxruntime.ai/)** by Microsoft — Enables running the Kokoro model directly in the browser via WebAssembly, making fully local, private TTS inference possible without any server.
- **[Kokoro ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)** by the ONNX Community (Xenova) — The ONNX-converted version of Kokoro, optimized for browser-based inference, which this extension loads and runs.
- **[eSpeak NG](https://github.com/espeak-ng/espeak-ng)** — A compact speech synthesizer used here for phoneme/tokenization processing that feeds into the Kokoro model.
- **[kokoro-web](https://github.com/eduardolat/kokoro-web)** by Eduardo Lát — A web-based Kokoro TTS interface that heavily inspired this extension.

## License

MIT
