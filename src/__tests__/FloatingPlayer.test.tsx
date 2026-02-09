import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { FloatingPlayer } from "../content/FloatingPlayer";
import { setPlaybackState } from "../content/playerStore";

// Mock SettingsPanel to avoid its chrome.runtime dependencies
vi.mock("../content/SettingsPanel", () => ({
  SettingsPanel: () => <div data-testid="settings-panel" />,
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
  onPickContent: vi.fn(),
  onClearContentSelector: vi.fn(),
  onSetContentSelector: vi.fn(),
  onSelectorFocus: vi.fn(),
  onSelectorBlur: vi.fn(),
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
