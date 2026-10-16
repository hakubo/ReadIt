import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { FloatingPlayer } from "../content/FloatingPlayer";
import { setPlaybackState } from "../content/playerStore";

// Mock SettingsPanel to avoid its chrome.runtime dependencies
vi.mock("../content/SettingsPanel", () => ({
  SettingsPanel: ({ position }: { position: { x: number; y: number } }) => (
    <div data-testid="settings-panel" data-x={position.x} data-y={position.y} />
  ),
}));

afterEach(cleanup);

const defaultProps = {
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onRestart: vi.fn(),
  onSetSpeed: vi.fn(),
  onClose: vi.fn(),
  onSettingsOpened: vi.fn(),
  onPositionChange: vi.fn(),
  onMinimizedChange: vi.fn(),
  onPickContent: vi.fn(),
  onClearContentSelector: vi.fn(),
  onSetContentSelector: vi.fn(),
  onSelectorFocus: vi.fn(),
  onSelectorBlur: vi.fn(),
  onNoisePreview: vi.fn(),
  onNoisePreviewHide: vi.fn(),
  onPickNoise: vi.fn(),
  noiseMatchCount: vi.fn().mockReturnValue(0),
};

function resetStore(overrides: Record<string, unknown> = {}) {
  setPlaybackState({
    loading: false,
    playerState: {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      currentIndex: 0,
      queueLength: 0,
    },
    speed: 1,
    totalElapsedTime: 0,
    totalEstimatedDuration: 0,
    finished: false,
    downloadProgress: null,
    forceSettingsOpen: false,
    domain: "example.com",
    theme: "dark",
    contentSelector: undefined,
    ...overrides,
  });
}

describe("FloatingPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("renders the player pill", () => {
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".kokoro-pill")).toBeInTheDocument();
  });

  it("keeps the level bars (and so the pill's width) when paused", () => {
    const playing = { isPlaying: true, currentTime: 5, duration: 30, currentIndex: 0, queueLength: 5 };
    resetStore({ playerState: playing });
    const { container, rerender } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".pill-eq:not(.paused)")).toBeInTheDocument();

    act(() => resetStore({ playerState: { ...playing, isPlaying: false } }));
    rerender(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".pill-eq.paused")).toBeInTheDocument();
  });

  it("shows speed button with current speed", () => {
    resetStore({ speed: 1.4 });
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".pill-speed")?.textContent).toBe("1.4x");
  });

  it("calls onPause when clicking play/pause while playing", () => {
    resetStore({
      playerState: {
        isPlaying: true,
        currentTime: 5,
        duration: 30,
        currentIndex: 0,
        queueLength: 5,
      },
    });
    const onPause = vi.fn();
    const { container } = render(
      <FloatingPlayer {...defaultProps} onPause={onPause} />,
    );
    fireEvent.click(container.querySelector(".pill-play-btn")!);
    expect(onPause).toHaveBeenCalledOnce();
  });

  it("calls onPlay when clicking play/pause while paused", () => {
    resetStore({
      playerState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        currentIndex: 0,
        queueLength: 5,
      },
    });
    const onPlay = vi.fn();
    const { container } = render(
      <FloatingPlayer {...defaultProps} onPlay={onPlay} />,
    );
    fireEvent.click(container.querySelector(".pill-play-btn")!);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("cycles speed when speed button is clicked", () => {
    resetStore({ speed: 1 });
    const onSetSpeed = vi.fn();
    const { container } = render(
      <FloatingPlayer {...defaultProps} onSetSpeed={onSetSpeed} />,
    );
    fireEvent.click(container.querySelector(".pill-speed")!);
    expect(onSetSpeed).toHaveBeenCalledWith(1.2);
  });

  it("shows close button when active", () => {
    resetStore({ loading: true });
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".pill-close")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    resetStore({ loading: true });
    const onClose = vi.fn();
    const { container } = render(
      <FloatingPlayer {...defaultProps} onClose={onClose} />,
    );
    fireEvent.click(container.querySelector(".pill-close")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows restart button when finished", () => {
    resetStore({ finished: true });
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".pill-restart-btn")).toBeInTheDocument();
  });

  it("calls onRestart when restart button is clicked", () => {
    resetStore({ finished: true });
    const onRestart = vi.fn();
    const { container } = render(
      <FloatingPlayer {...defaultProps} onRestart={onRestart} />,
    );
    fireEvent.click(container.querySelector(".pill-restart-btn")!);
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it("applies theme-light class for light theme", () => {
    resetStore({ theme: "light" });
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".kokoro-pill")?.className).toContain(
      "theme-light",
    );
  });

  it("does not apply theme-light class for dark theme", () => {
    resetStore({ theme: "dark" });
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".kokoro-pill")?.className).not.toContain(
      "theme-light",
    );
  });

  it("toggles settings panel when cog is clicked", () => {
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    const cogBtn = container.querySelector(".pill-cog")!;
    fireEvent.click(cogBtn);
    expect(cogBtn.className).toContain("active");
  });

  it("keeps the settings panel in place when playback starts", () => {
    const { container, rerender } = render(
      <FloatingPlayer {...defaultProps} initialPosition={{ x: 100, y: 20 }} />,
    );
    fireEvent.click(container.querySelector(".pill-cog")!);
    const panel = () => container.querySelector("[data-testid=settings-panel]")!;
    const before = { x: panel().getAttribute("data-x"), y: panel().getAttribute("data-y") };
    expect(before).toEqual({ x: "100", y: "76" });

    // Playing adds the Stop button and changes the time text, so the pill gets wider
    act(() => resetStore({
      loading: true,
      playerState: { isPlaying: true, currentTime: 5, duration: 30, currentIndex: 0, queueLength: 5 },
      totalElapsedTime: 5,
      totalEstimatedDuration: 600,
    }));
    rerender(<FloatingPlayer {...defaultProps} initialPosition={{ x: 100, y: 20 }} />);
    expect(container.querySelector(".pill-close")).toBeInTheDocument();
    expect({ x: panel().getAttribute("data-x"), y: panel().getAttribute("data-y") }).toEqual(before);
  });

  it("minimizes to the play button and expands back", () => {
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    fireEvent.click(container.querySelector(".pill-cog")!);
    fireEvent.click(container.querySelector(".pill-minimize")!);

    expect(container.querySelector(".pill-minimized")).toBeInTheDocument();
    expect(container.querySelector(".pill-play-btn")).toBeInTheDocument();
    expect(container.querySelector(".pill-speed")).not.toBeInTheDocument();
    expect(container.querySelector(".pill-cog")).not.toBeInTheDocument();
    expect(defaultProps.onMinimizedChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(container.querySelector(".pill-expand")!);
    expect(container.querySelector(".pill-minimized")).not.toBeInTheDocument();
    expect(container.querySelector(".pill-speed")).toBeInTheDocument();
    // Minimizing closed the settings panel; expanding doesn't reopen it
    expect(container.querySelector(".pill-cog")!.className).not.toContain("active");
    expect(defaultProps.onMinimizedChange).toHaveBeenLastCalledWith(false);
  });

  it("starts minimized when the site saved it that way", () => {
    const { container } = render(<FloatingPlayer {...defaultProps} initialMinimized />);
    expect(container.querySelector(".pill-expand")).toBeInTheDocument();
    expect(defaultProps.onMinimizedChange).not.toHaveBeenCalled();
  });

  it("expands when settings are opened from the context menu", () => {
    const { container, rerender } = render(<FloatingPlayer {...defaultProps} initialMinimized />);
    act(() => resetStore({ forceSettingsOpen: true }));
    rerender(<FloatingPlayer {...defaultProps} initialMinimized />);
    expect(container.querySelector(".pill-cog")!.className).toContain("active");
  });

  it("closes the settings panel where it was when minimizing", () => {
    const { container } = render(
      <FloatingPlayer {...defaultProps} initialPosition={{ x: 100, y: 20 }} />,
    );
    fireEvent.click(container.querySelector(".pill-cog")!);
    const panel = () => container.querySelector("[data-testid=settings-panel]")!;
    const before = { x: panel().getAttribute("data-x"), y: panel().getAttribute("data-y") };

    // Pinning the pill's right edge moves its left edge (and so `position.x`)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      { left: 900, right: 1200, top: 20, bottom: 68, width: 300, height: 48 } as DOMRect,
    );
    fireEvent.click(container.querySelector(".pill-minimize")!);
    vi.restoreAllMocks();
    expect({ x: panel().getAttribute("data-x"), y: panel().getAttribute("data-y") }).toEqual(before);
  });

  it("shows download progress when downloading", () => {
    resetStore({
      loading: true,
      downloadProgress: { downloaded: 50, total: 100 },
      playerState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        currentIndex: 0,
        queueLength: 0,
      },
    });
    const { container } = render(<FloatingPlayer {...defaultProps} />);
    expect(container.querySelector(".pill-elapsed")?.textContent).toBe("50%");
  });
});
