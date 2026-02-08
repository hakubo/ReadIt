export type Model = (typeof models)[number];
export type ModelId = Model["id"];

export const models = [
  {
    id: "model",
    quantization: "fp32",
    size: "326 MB",
  },
  {
    id: "model_q4",
    quantization: "4-bit matmul",
    size: "305 MB",
  },
  {
    id: "model_uint8",
    quantization: "8-bit & mixed precision",
    size: "177 MB",
  },
  {
    id: "model_fp16",
    quantization: "fp16",
    size: "163 MB",
  },
  {
    id: "model_q4f16",
    quantization: "4-bit matmul & fp16 weights",
    size: "154 MB",
  },
  {
    id: "model_uint8f16",
    quantization: "Mixed precision",
    size: "114 MB",
  },
  {
    id: "model_quantized",
    quantization: "8-bit",
    size: "92.4 MB",
  },
  {
    id: "model_q8f16",
    quantization: "Mixed precision",
    size: "86 MB",
  },
] as const;

export const modelsMap: Record<ModelId, Model> = (() => {
  const map: Record<ModelId, Model> = {} as Record<ModelId, Model>;
  for (const model of models) {
    map[model.id] = model;
  }
  return map;
})();

export const modelsIds = models.map((model) => model.id);
