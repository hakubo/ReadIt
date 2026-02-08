import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { setPlaybackState, usePlaybackStore } from "../content/playerStore";

describe("playerStore", () => {
  beforeEach(() => {
    // Reset to defaults
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
      domain: "",
      theme: "dark",
      contentSelector: undefined,
    });
  });

  it("returns default snapshot", () => {
    const { result } = renderHook(() => usePlaybackStore());
    expect(result.current.loading).toBe(false);
    expect(result.current.speed).toBe(1);
    expect(result.current.theme).toBe("dark");
    expect(result.current.playerState.isPlaying).toBe(false);
  });

  it("updates loading state", () => {
    const { result } = renderHook(() => usePlaybackStore());

    act(() => {
      setPlaybackState({ loading: true });
    });

    expect(result.current.loading).toBe(true);
  });

  it("updates speed", () => {
    const { result } = renderHook(() => usePlaybackStore());

    act(() => {
      setPlaybackState({ speed: 1.5 });
    });

    expect(result.current.speed).toBe(1.5);
  });

  it("merges partial updates without overwriting other fields", () => {
    const { result } = renderHook(() => usePlaybackStore());

    act(() => {
      setPlaybackState({ loading: true, domain: "example.com" });
    });
    act(() => {
      setPlaybackState({ speed: 2 });
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.domain).toBe("example.com");
    expect(result.current.speed).toBe(2);
  });

  it("updates playerState", () => {
    const { result } = renderHook(() => usePlaybackStore());

    act(() => {
      setPlaybackState({
        playerState: {
          isPlaying: true,
          currentTime: 5,
          duration: 30,
          currentIndex: 2,
          queueLength: 10,
        },
      });
    });

    expect(result.current.playerState.isPlaying).toBe(true);
    expect(result.current.playerState.currentIndex).toBe(2);
    expect(result.current.playerState.queueLength).toBe(10);
  });
});
