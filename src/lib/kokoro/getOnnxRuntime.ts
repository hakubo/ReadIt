import * as ortweb from "onnxruntime-web/webgpu";

// Load the WASM files bundled with the extension. Never a CDN: the Chrome
// Web Store forbids remotely hosted code.
if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
  ortweb.env.wasm.wasmPaths = chrome.runtime.getURL("/");
}

/**
 * Returns the onnx runtime web module.
 */
export function getOnnxRuntime(): typeof ortweb {
  return ortweb;
}
