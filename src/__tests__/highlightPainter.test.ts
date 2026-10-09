import { describe, it, expect } from "vitest";
import { lineBoxes, intersectBoxes, visibleArea } from "../content/highlightPainter";

const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);

describe("lineBoxes", () => {
  it("merges rects on one line into a single box spanning the tallest one", () => {
    // Plain text, then a taller inline <code> span, then plain text again
    const boxes = lineBoxes([rect(0, 102, 80, 18), rect(80, 100, 60, 22), rect(140, 102, 50, 18)]);
    expect(boxes).toEqual([{ left: 0, top: 100, right: 190, bottom: 122 }]);
  });

  it("keeps separate lines apart", () => {
    const boxes = lineBoxes([rect(0, 100, 300, 20), rect(0, 124, 120, 20)]);
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toEqual({ left: 0, top: 124, right: 120, bottom: 144 });
  });

  it("drops empty rects", () => {
    expect(lineBoxes([rect(0, 100, 0, 20), rect(5, 100, 10, 0)])).toEqual([]);
  });
});

describe("intersectBoxes", () => {
  it("returns null when boxes don't overlap", () => {
    expect(intersectBoxes({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 0, right: 30, bottom: 10 })).toBeNull();
  });
});

describe("visibleArea", () => {
  it("clips to a scrolling ancestor so text scrolled out of it isn't painted", () => {
    document.body.innerHTML = `<div id="scroller" style="overflow-y: auto"><p id="text">Text</p></div>`;
    const scroller = document.getElementById("scroller")!;
    scroller.getBoundingClientRect = () => new DOMRect(100, 50, 400, 300);
    expect(visibleArea(document.getElementById("text"))).toEqual({ left: 100, top: 50, right: 500, bottom: 350 });
  });

  it("is the viewport when nothing clips", () => {
    document.body.innerHTML = `<p id="text">Text</p>`;
    expect(visibleArea(document.getElementById("text"))).toEqual({
      left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight,
    });
  });
});
