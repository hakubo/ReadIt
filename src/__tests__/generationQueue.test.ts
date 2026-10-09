import { describe, it, expect } from "vitest";
import { createGenerationQueue, takeNextSentenceIndex, type GenerationQueue } from "@/offscreen/generationQueue";

/** Take and mark generated until the queue has nothing inside the window. */
function drain(queue: GenerationQueue): number[] {
  const order: number[] = [];
  for (let index = takeNextSentenceIndex(queue); index !== null; index = takeNextSentenceIndex(queue)) {
    queue.generated.add(index);
    order.push(index);
  }
  return order;
}

describe("takeNextSentenceIndex", () => {
  it("generates in order up to the window limit", () => {
    const queue = createGenerationQueue(20, 5);
    expect(drain(queue)).toEqual([0, 1, 2, 3, 4]);
  });

  it("jumps to a seek target, then fills the skipped sentences", () => {
    const queue = createGenerationQueue(12, 3);
    expect(drain(queue)).toEqual([0, 1, 2]);
    queue.priorityIndex = 8;
    queue.generateUpTo = 9;
    expect(drain(queue)).toEqual([8, 9, 3, 4, 5, 6, 7]);
  });

  it("prefers moving forward over filling gaps once the window moves", () => {
    const queue = createGenerationQueue(12, 3);
    queue.priorityIndex = 6;
    queue.generateUpTo = 6;
    expect(takeNextSentenceIndex(queue)).toBe(6);
    queue.generated.add(6);
    queue.generateUpTo = 8;
    expect(takeNextSentenceIndex(queue)).toBe(7);
  });

  it("moves the cursor on a seek to an already generated sentence", () => {
    const queue = createGenerationQueue(10, 10);
    queue.generated.add(4);
    queue.priorityIndex = 4;
    expect(takeNextSentenceIndex(queue)).toBe(5);
  });

  it("returns null when everything is generated", () => {
    const queue = createGenerationQueue(3, 15);
    drain(queue);
    expect(takeNextSentenceIndex(queue)).toBeNull();
  });
});
