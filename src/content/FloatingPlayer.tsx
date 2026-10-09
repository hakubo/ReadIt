import { memo, useEffect, useRef, useState } from "react";
import { Play, Pause, X, RotateCcw, Settings } from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { usePlaybackStore } from "./playerStore";

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentIndex: number;
  queueLength: number;
}

// Stable callback props — these should be module-level functions in index.tsx
// so React sees the same reference every render.
interface FloatingPlayerProps {
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSetSpeed: (speed: number) => void;
  onClose: () => void;
  onSettingsOpened: () => void;
  initialPosition?: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  onPickContent: () => void;
  onClearContentSelector: () => void;
  onSetContentSelector: (selector: string) => void;
  onSelectorFocus: () => void;
  onSelectorBlur: () => void;
  onNoisePreview: (selector: string) => void;
  onNoisePreviewHide: () => void;
  onPickNoise: () => void;
  noiseMatchCount: (selector: string) => number;
}

const SPEED_OPTIONS = [0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2];

// Must match .settings-panel width in styles.ts (the panel is right-aligned to the pill)
const SETTINGS_PANEL_WIDTH = 300;

// SVG progress ring constants (sized for horizontal bar)
const RING_RADIUS = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clampToViewport(pos: { x: number; y: number }, el: HTMLElement | null) {
  const w = el?.offsetWidth || 300;
  const h = el?.offsetHeight || 40;
  return {
    x: Math.max(0, Math.min(pos.x, window.innerWidth - w)),
    y: Math.max(0, Math.min(pos.y, window.innerHeight - h)),
  };
}

/** Violet → sky gradient for the progress ring (ids are scoped to the player's shadow root). */
function RingGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#38bdf8" />
      </linearGradient>
    </defs>
  );
}

/** Progress ring around the play button: `progress` from 0 to 1. */
function ProgressRing({ progress }: { progress: number }) {
  return (
    <svg width="38" height="38" viewBox="0 0 36 36">
      <RingGradient id="readit-ring-grad" />
      <circle className="ring-track" cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="2.5" />
      <circle
        className="progress-ring-fill"
        cx="18" cy="18" r={RING_RADIUS} fill="none"
        stroke="url(#readit-ring-grad)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

// Memoized SettingsPanel wrapper — only re-renders when its own props change
const MemoizedSettingsPanel = memo(SettingsPanel);

export function FloatingPlayer({
  onPlay,
  onPause,
  onRestart,
  onSetSpeed,
  onClose,
  onSettingsOpened,
  initialPosition,
  onPositionChange,
  onPickContent,
  onClearContentSelector,
  onSetContentSelector,
  onSelectorFocus,
  onSelectorBlur,
  onNoisePreview,
  onNoisePreviewHide,
  onPickNoise,
  noiseMatchCount,
}: FloatingPlayerProps) {
  // Subscribe to the external playback store — re-renders only when snapshot changes
  const {
    loading,
    playerState,
    speed,
    totalElapsedTime,
    totalEstimatedDuration,
    finished,
    downloadProgress,
    error,
    forceSettingsOpen,
    domain,
    theme,
    contentSelector,
  } = usePlaybackStore();

  const [position, setPosition] = useState(() => {
    const initial = initialPosition || { x: window.innerWidth - 320, y: 8 };
    return clampToViewport(initial, null);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (forceSettingsOpen && !settingsOpen) {
      setSettingsOpen(true);
      onSettingsOpened();
    }
  }, [forceSettingsOpen]);

  const playerRef = useRef<HTMLDivElement>(null);

  const handleSpeedCycle = () => {
    const currentIdx = SPEED_OPTIONS.indexOf(speed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    onSetSpeed(SPEED_OPTIONS[nextIdx]);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition(clampToViewport({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        }, playerRef.current));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Save position when drag ends
  const wasDragging = useRef(false);
  useEffect(() => {
    if (wasDragging.current && !isDragging) {
      onPositionChange(position);
    }
    wasDragging.current = isDragging;
  }, [isDragging]);

  // Clamp to viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => clampToViewport(prev, playerRef.current));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    // Don't initiate drag from interactive elements
    if ((e.target as HTMLElement).closest("button, a")) {return;}
    if (playerRef.current) {
      const rect = playerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  const togglePlayPause = () => {
    if (playerState.isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) {return "0:00";}
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const showSpinner = loading && playerState.queueLength === 0;
  const isDownloading = showSpinner && downloadProgress != null;
  const downloadPct = downloadProgress && downloadProgress.total > 0
    ? Math.floor((downloadProgress.downloaded / downloadProgress.total) * 100)
    : 0;
  const hasAudio = playerState.queueLength > 0;
  const isActive = loading || hasAudio || finished;
  const progress = finished
    ? 1
    : totalEstimatedDuration > 0
      ? Math.min(totalElapsedTime / totalEstimatedDuration, 1)
      : 0;

  // Settings panel positioned below the pill, right-aligned
  // eslint-disable-next-line react-hooks/refs -- intentional: read ref for layout positioning
  const pillRect = playerRef.current?.getBoundingClientRect();
  const settingsPanelPos = pillRect
    ? { x: Math.max(8, pillRect.right - SETTINGS_PANEL_WIDTH), y: pillRect.bottom + 8 }
    : { x: position.x, y: position.y + 48 };

  const handleSettingsClose = () => setSettingsOpen(false);
  const handleSettingsToggle = () => setSettingsOpen(!settingsOpen);
  const handlePickContent = () => { setSettingsOpen(false); onPickContent(); };
  const handlePickNoise = () => { setSettingsOpen(false); onPickNoise(); };

  return (
    <>
      <div
        ref={playerRef}
        className={`kokoro-pill${playerState.isPlaying ? " pill-playing" : ""}${theme === "light" ? " theme-light" : ""}`}
        style={{
          position: "fixed",
          zIndex: 2147483647,
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        onMouseDown={handleDragStart}
      >
        {/* Play/Pause with progress ring */}
        <div className="pill-play-wrapper">
          {showSpinner && !isDownloading ? (
            <svg className="spinner" width="38" height="38" viewBox="0 0 36 36" fill="none" strokeWidth="2.5">
              <RingGradient id="readit-spin-grad" />
              <circle className="ring-track" cx="18" cy="18" r="14" />
              <path d="M18 4a14 14 0 0 1 14 14" stroke="url(#readit-spin-grad)" strokeLinecap="round" />
            </svg>
          ) : (
            <ProgressRing progress={isDownloading ? downloadPct / 100 : progress} />
          )}
          {finished ? (
            <button className="pill-play-btn pill-restart-btn" onClick={onRestart}>
              <RotateCcw size={14} />
            </button>
          ) : (
            <button className="pill-play-btn" onClick={togglePlayPause} disabled={showSpinner}>
              {playerState.isPlaying
                ? <Pause key="pause" size={12} fill="currentColor" />
                : <Play key="play" size={12} fill="currentColor" style={{ marginLeft: 1 }} />}
            </button>
          )}
        </div>

        {playerState.isPlaying && (
          <span className="pill-eq" aria-hidden="true"><i /><i /><i /></span>
        )}

        {/* Time: elapsed / total, or the last generation error */}
        {error ? (
          <div className="pill-time pill-error" role="alert" title={error}>
            Error
          </div>
        ) : (
        <div className="pill-time">
          <span className="pill-elapsed">
            {isDownloading ? `${downloadPct}%` : formatTime(totalElapsedTime / speed)}
          </span>
          <span className="pill-time-sep">/</span>
          <span className={`pill-total-time${loading ? " pill-total-loading" : ""}`}>
            {loading && totalEstimatedDuration === 0
              ? "--:--"
              : (loading || !hasAudio || (!isActive && totalEstimatedDuration === 0) ? "~" : "") + formatTime(totalEstimatedDuration / speed)}
          </span>
        </div>
        )}

        {/* Speed */}
        <button className="pill-speed" onClick={handleSpeedCycle} title="Playback speed">
          {/* Keyed so the new value animates in on every change */}
          <span key={speed}>{speed}x</span>
        </button>

        {/* Settings cog */}
        <button
          className={`pill-icon-btn pill-cog${settingsOpen ? " active" : ""}`}
          onClick={handleSettingsToggle}
          title="Settings"
        >
          <Settings size={14} />
        </button>

        {/* Buy Me a Coffee */}
        <a
          className="pill-bmc"
          href="https://buymeacoffee.com/jakubolek"
          target="_blank"
          rel="noopener noreferrer"
          title="Support me on Buy me a coffee!"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 01-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 00-1.322-.238c-.826 0-1.491.284-2.26.613z" />
          </svg>
        </a>

        {/* Close — only when actively loading or playing */}
        {isActive && (
          <button className="pill-icon-btn pill-close" onClick={onClose} title="Stop">
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>

      <MemoizedSettingsPanel
        position={settingsPanelPos}
        onClose={handleSettingsClose}
        domain={domain}
        theme={theme}
        visible={settingsOpen}
        onPickContent={handlePickContent}
        contentSelector={contentSelector}
        onClearContentSelector={onClearContentSelector}
        onSetContentSelector={onSetContentSelector}
        onSelectorFocus={onSelectorFocus}
        onSelectorBlur={onSelectorBlur}
        onNoisePreview={onNoisePreview}
        onNoisePreviewHide={onNoisePreviewHide}
        onPickNoise={handlePickNoise}
        noiseMatchCount={noiseMatchCount}
      />
    </>
  );
}
