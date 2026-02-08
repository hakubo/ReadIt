# unmute.page

A Chrome extension that adds text-to-speech to any webpage. Select text, click "Read", and listen — powered by [Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), running 100% locally in your browser.

## Features

- 54 natural-sounding AI voices
- Sentence-by-sentence highlighting with auto-scroll
- Adjustable playback speed (0.6x–2.0x)
- Per-site content selector and settings
- Light/dark theme
- Fully private — no data leaves your browser

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

```
Content Script (page) ←→ Background (service worker) ←→ Offscreen Document (TTS/Audio)
         ↓                                                        ↓
   Floating UI                                              ONNX inference
   (Shadow DOM)                                             Audio playback
```

## License

MIT
