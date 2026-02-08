import * as ortweb from "onnxruntime-web/webgpu";

// Use bundled WASM files in extension context
// chrome.runtime.getURL provides the correct extension URL for the files
if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
  ortweb.env.wasm.wasmPaths = chrome.runtime.getURL("/");
} else {
  // Fallback to CDN for non-extension contexts (development)
  ortweb.env.wasm.wasmPaths =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.1/dist/";
}

/**
 * Returns the onnx runtime web module.
 */
export function getOnnxRuntime(): typeof ortweb {
  return ortweb;
}
