# Privacy Policy — Read it!

_Last updated: October 9, 2026_

Read it! is a Chrome extension that reads web page text aloud. It was built so that everything happens on your own computer.

## What we collect

**Nothing.** Read it! does not collect, store on a server, sell or share any personal data. There are no accounts, no analytics, no tracking and no advertising.

## Page content

When you start reading, the extension takes the text you selected (or the main article on the page) and turns it into speech **inside your browser**, using a speech model that runs locally. That text is never sent to us or to anyone else. It is kept in memory only while it is being read.

## Data stored on your device

The extension saves your preferences using Chrome's built-in storage:

- **Settings:** voice, speed, highlight colour, theme and reading options (`chrome.storage.sync`, which Chrome may sync between your own signed-in browsers).
- **Per-site preferences:** for sites where you change them, e.g. player position, auto-open, and which part of the page to read (`chrome.storage.local`).
- **The speech model and voices:** cached in your browser after the first download.

You can remove all of this at any time by uninstalling the extension.

## Network requests

The only network requests the extension makes are to download the open-source Kokoro speech model and voice files from Hugging Face (`huggingface.co`) the first time you read something. These requests contain no information about you or the pages you read. Hugging Face, like any web server, may log standard request data such as your IP address; see the [Hugging Face privacy policy](https://huggingface.co/privacy).

## Permissions

- **storage:** to save the settings above.
- **offscreen:** to run the speech engine.
- **contextMenus:** for the "Open settings" item on the toolbar icon.
- **power:** to keep your screen on while text is being read.
- **alarms:** to unload the speech engine when it's idle, to free memory.
- **Access to websites:** so the Read button and player can appear on any page you choose to read.

## Changes

If this policy changes, the new version will be published at this address with a new date. The source code is public at [github.com/hakubo/ReadIt](https://github.com/hakubo/ReadIt), so anyone can check what the extension does.

## Contact

Questions or concerns: open an issue at [github.com/hakubo/ReadIt/issues](https://github.com/hakubo/ReadIt/issues).
