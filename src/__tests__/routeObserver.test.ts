import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { observeRouteChanges } from "../content/routeObserver";

describe("observeRouteChanges", () => {
  let onRouteChange: ReturnType<typeof vi.fn<() => void>>;
  let onContentReady: ReturnType<typeof vi.fn<() => void>>;
  let cleanup: () => void;
  let mutationCallback: MutationCallback;

  const originalLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    onRouteChange = vi.fn<() => void>();
    onContentReady = vi.fn<() => void>();

    // Capture the MutationObserver callback so we can trigger it manually
    vi.spyOn(MutationObserver.prototype, "observe");
    vi.spyOn(MutationObserver.prototype, "disconnect");

    const OriginalMutationObserver = MutationObserver;
    vi.stubGlobal(
      "MutationObserver",
      class extends OriginalMutationObserver {
        constructor(cb: MutationCallback) {
          super(cb);
          mutationCallback = cb;
        }
      },
    );
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Reset location
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  function setLocation(pathname: string, search = "") {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, pathname, search },
      writable: true,
    });
  }

  function simulateMutation() {
    mutationCallback([] as unknown as MutationRecord[], {} as MutationObserver);
  }

  it("calls onRouteChange when pathname changes after DOM mutation", () => {
    setLocation("/page-1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    setLocation("/page-2");
    simulateMutation();
    vi.advanceTimersByTime(50); // mutation debounce

    expect(onRouteChange).toHaveBeenCalledOnce();
  });

  it("calls onContentReady after DOM settles following a route change", () => {
    setLocation("/page-1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    setLocation("/page-2");
    simulateMutation();
    vi.advanceTimersByTime(50); // mutation debounce

    expect(onContentReady).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500); // DOM settle delay

    expect(onContentReady).toHaveBeenCalledOnce();
  });

  it("ignores DOM mutations when pathname has not changed", () => {
    setLocation("/same-page");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    simulateMutation();
    vi.advanceTimersByTime(50);

    expect(onRouteChange).not.toHaveBeenCalled();
    expect(onContentReady).not.toHaveBeenCalled();
  });

  it("treats search param changes as route changes", () => {
    setLocation("/page", "?tab=1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    setLocation("/page", "?tab=2");
    simulateMutation();
    vi.advanceTimersByTime(50);

    expect(onRouteChange).toHaveBeenCalledOnce();
  });

  it("fires on popstate events", () => {
    setLocation("/page-1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    setLocation("/page-2");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onRouteChange).toHaveBeenCalledOnce();
  });

  it("debounces rapid DOM mutations into a single check", () => {
    setLocation("/page-1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    setLocation("/page-2");
    simulateMutation();
    simulateMutation();
    simulateMutation();
    vi.advanceTimersByTime(50);

    expect(onRouteChange).toHaveBeenCalledOnce();
  });

  it("resets settle timer on rapid route changes", () => {
    setLocation("/page-1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    // First route change
    setLocation("/page-2");
    simulateMutation();
    vi.advanceTimersByTime(50);
    expect(onRouteChange).toHaveBeenCalledOnce();

    // Advance partway through settle
    vi.advanceTimersByTime(300);
    expect(onContentReady).not.toHaveBeenCalled();

    // Second route change before settle completes
    setLocation("/page-3");
    simulateMutation();
    vi.advanceTimersByTime(50);
    expect(onRouteChange).toHaveBeenCalledTimes(2);

    // Original settle timer should have been cleared, new one starts
    vi.advanceTimersByTime(300);
    expect(onContentReady).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onContentReady).toHaveBeenCalledOnce();
  });

  it("cleanup removes popstate listener and disconnects observer", () => {
    setLocation("/page-1");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);
    cleanup();

    // popstate should no longer trigger the handler
    setLocation("/page-2");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onRouteChange).not.toHaveBeenCalled();
    expect(onContentReady).not.toHaveBeenCalled();
    expect(MutationObserver.prototype.disconnect).toHaveBeenCalled();
  });

  it("does not fire onRouteChange for hash-only changes", () => {
    setLocation("/page");
    cleanup = observeRouteChanges(onRouteChange, onContentReady);

    // Hash changes don't alter pathname or search
    simulateMutation();
    vi.advanceTimersByTime(50);

    expect(onRouteChange).not.toHaveBeenCalled();
  });
});
