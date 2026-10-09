// Decides which sentence the windowed generation loop makes next.
//
// Order: a seek target first, then the next missing sentence from the cursor
// up to the window limit, then sentences a forward seek skipped over. The last
// step means no sentence is left ungenerated once the loop ends, so a later
// seek back into a skipped range always finds its audio.

export interface GenerationQueue {
  total: number;
  generated: Set<number>;
  /** Where forward generation continues from. Moves on a seek. */
  cursor: number;
  /** Highest index the window allows generating now. */
  generateUpTo: number;
  /** Sentence the user seeked to, or -1. */
  priorityIndex: number;
}

export function createGenerationQueue(total: number, windowSize: number): GenerationQueue {
  return {
    total,
    generated: new Set<number>(),
    cursor: 0,
    generateUpTo: windowSize - 1,
    priorityIndex: -1,
  };
}

function findMissing(queue: GenerationQueue, from: number, to: number): number | null {
  for (let index = Math.max(from, 0); index <= to; index++) {
    if (!queue.generated.has(index)) {
      return index;
    }
  }
  return null;
}

/** Consume a pending seek: move the cursor there. Returns the index if it still needs audio. */
function takePriorityIndex(queue: GenerationQueue): number | null {
  const index = queue.priorityIndex;
  queue.priorityIndex = -1;
  if (index < 0 || index >= queue.total) {
    return null;
  }
  queue.cursor = index;
  return queue.generated.has(index) ? null : index;
}

/**
 * Next sentence to generate, or null when everything inside the window is
 * done and the loop should wait for the window to move (or for a seek).
 */
export function takeNextSentenceIndex(queue: GenerationQueue): number | null {
  const priority = takePriorityIndex(queue);
  if (priority !== null) {
    return priority;
  }
  const lastInWindow = Math.min(queue.generateUpTo, queue.total - 1);
  const ahead = findMissing(queue, queue.cursor, lastInWindow);
  if (ahead !== null) {
    queue.cursor = ahead;
    return ahead;
  }
  // Fill sentences skipped by a forward seek while the window is full.
  return findMissing(queue, 0, Math.min(queue.cursor, lastInWindow));
}

export function isQueueComplete(queue: GenerationQueue): boolean {
  return queue.generated.size >= queue.total;
}
