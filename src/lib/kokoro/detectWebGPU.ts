export type Acceleration = "webgpu" | "cpu";

function hasWebGPU(): boolean {
  const nav = navigator as unknown as { gpu?: { requestAdapter?: () => void } };
  return !!nav.gpu && typeof nav.gpu.requestAdapter === "function";
}

export const acceleration: Acceleration = hasWebGPU() ? "webgpu" : "cpu";
