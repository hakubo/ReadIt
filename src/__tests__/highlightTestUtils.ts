// Test doubles for browser features jsdom lacks: layout rects and checkVisibility.

/**
 * Give every Range one rect: top from the closest [data-top] ancestor of its
 * start, left from the start offset, so tests can tell which occurrence matched.
 */
export function stubRangeRects(): () => void {
  const prototype = Range.prototype as unknown as {
    getClientRects?: (this: Range) => DOMRectList;
    getBoundingClientRect?: (this: Range) => DOMRect;
  };
  const originalClientRects = prototype.getClientRects;
  const originalBoundingRect = prototype.getBoundingClientRect;
  const rectFor = (range: Range) => {
    const owner = range.startContainer.parentElement;
    const top = Number(owner?.closest("[data-top]")?.getAttribute("data-top") ?? 0);
    return new DOMRect(range.startOffset, top, 10, 20);
  };
  prototype.getClientRects = function (this: Range) {
    const rects = [rectFor(this)];
    return Object.assign(rects, { item: (i: number) => rects[i] }) as unknown as DOMRectList;
  };
  prototype.getBoundingClientRect = function (this: Range) {
    return rectFor(this);
  };
  return () => {
    prototype.getClientRects = originalClientRects;
    prototype.getBoundingClientRect = originalBoundingRect;
    if (!originalClientRects) {
      delete prototype.getClientRects;
    }
    if (!originalBoundingRect) {
      delete prototype.getBoundingClientRect;
    }
  };
}

/**
 * Chrome's checkVisibility(): false for display:none (inline style here) and
 * for display:contents, which has no box of its own.
 */
export function stubCheckVisibility(): () => void {
  const prototype = Element.prototype as unknown as { checkVisibility?: (this: Element) => boolean };
  const original = prototype.checkVisibility;
  prototype.checkVisibility = function (this: Element) {
    if ((this as HTMLElement).style?.display === "contents") {
      return false;
    }
    return !this.closest("[style*='display: none']");
  };
  return () => {
    if (original) {
      prototype.checkVisibility = original;
    } else {
      delete prototype.checkVisibility;
    }
  };
}
