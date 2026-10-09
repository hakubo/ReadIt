import { describe, it, expect } from "vitest";
import { createReadId, isMessageForRead } from "@/shared/readId";

describe("read ids", () => {
  it("are unique per read", () => {
    expect(createReadId()).not.toBe(createReadId());
  });

  it("match only messages of the same read", () => {
    const readId = createReadId();
    expect(isMessageForRead({ readId }, readId)).toBe(true);
    expect(isMessageForRead({ readId: createReadId() }, readId)).toBe(false);
    expect(isMessageForRead({}, readId)).toBe(false);
  });

  it("match nothing when there is no current read", () => {
    expect(isMessageForRead({}, null)).toBe(false);
    expect(isMessageForRead({ readId: null }, null)).toBe(false);
    expect(isMessageForRead({ readId: undefined }, undefined)).toBe(false);
  });
});
