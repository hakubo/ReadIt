import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { StartTiming } from "../playerStore";
import { realtimeFactor, type DebugSnapshot } from "./debugData";
import type { DebugConfig } from "./debugConfig";
import { ConfigTab, EventsTab, SentencesTab } from "./debugTabs";
import { formatSeconds, usePolled } from "./debugHooks";

export { DEBUG_PANEL_STYLES } from "./debugPanelStyles";

const POLL_INTERVAL_MS = 250;

const TABS = ["sentences", "events", "config"] as const;
type Tab = (typeof TABS)[number];

interface DebugPanelProps {
  getSnapshot: () => DebugSnapshot;
  getConfig: () => DebugConfig;
  onSeek: (index: number) => void;
  onClose: () => void;
}

// --- Dragging ---

interface Position { x: number; y: number }

/** Drag the panel by its header. Null position = default corner placement from CSS. */
function useDrag(panel: React.RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<Position | null>(null);
  const grab = useRef<Position | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button") || !panel.current) {
      return;
    }
    const rect = panel.current.getBoundingClientRect();
    grab.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!grab.current) {
      return;
    }
    const x = Math.min(Math.max(0, event.clientX - grab.current.x), window.innerWidth - 120);
    const y = Math.min(Math.max(0, event.clientY - grab.current.y), window.innerHeight - 48);
    setPosition({ x, y });
  };
  const onPointerUp = () => {
    grab.current = null;
  };
  return { position, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

// --- Overview ---

type PlaybackMood = "playing" | "busy" | "idle";

function playbackMood(snapshot: DebugSnapshot): PlaybackMood {
  if (snapshot.flags.playing) {
    return "playing";
  }
  return snapshot.flags.loading || snapshot.flags.streaming ? "busy" : "idle";
}

function StatusOrb({ mood }: { mood: PlaybackMood }) {
  return <span className={`orb orb-${mood}`} aria-hidden="true" />;
}

const START_STEPS: { key: keyof StartTiming; label: string }[] = [
  { key: "prepareReadMs", label: "prepare" },
  { key: "toOffscreenMs", label: "offscreen" },
  { key: "warmUpWaitMs", label: "warm-up" },
  { key: "modelLoadMs", label: "model" },
  { key: "textPrepareMs", label: "text" },
  { key: "synthesisMs", label: "first sentence" },
  { key: "deliverAudioMs", label: "deliver" },
  { key: "playbackStartMs", label: "play" },
];

function StartCard({ timing }: { timing: StartTiming | null }) {
  if (!timing) {
    return (
      <div className="card">
        <div className="card-label">Last start</div>
        <div className="card-value muted">—</div>
        <div className="card-hint">Press Play to measure</div>
      </div>
    );
  }
  const steps = START_STEPS.map(step => ({ ...step, ms: Number(timing[step.key]) || 0 })).filter(step => step.ms >= 20);
  const stepsTotal = steps.reduce((sum, step) => sum + step.ms, 0) || 1;
  return (
    <div className="card card-wide">
      <div className="card-label">
        Last start <span className="tag">{timing.acceleration === "webgpu" ? "WebGPU" : "CPU"}</span>
        {timing.modelWasLoaded && <span className="tag tag-good">model warm</span>}
      </div>
      <div className="card-value">{formatSeconds(timing.totalMs)}</div>
      <div className="stack-bar">
        {steps.map((step, position) => (
          <span key={step.key} className={`seg seg-${position % 8}`} style={{ flexGrow: step.ms / stepsTotal }}
            title={`${step.label}: ${formatSeconds(step.ms, 2)}`} />
        ))}
      </div>
      <div className="legend">
        {steps.map((step, position) => (
          <span key={step.key}><i className={`seg-${position % 8}`} />{step.label} {formatSeconds(step.ms)}</span>
        ))}
      </div>
    </div>
  );
}

function SpeedCard({ factor }: { factor: number | null }) {
  const level = factor === null ? "muted" : factor < 0.5 ? "good" : factor < 1 ? "warn" : "bad";
  const fill = factor === null ? 0 : Math.min(factor, 1.5) / 1.5;
  return (
    <div className="card" title="Generation time ÷ audio length. Above 1× playback catches up with generation and stalls.">
      <div className="card-label">Gen speed</div>
      <div className={`card-value ${level}`}>{factor === null ? "—" : `${factor.toFixed(2)}×`}</div>
      <div className="meter"><span className={`meter-fill ${level}`} style={{ transform: `scaleX(${fill})` }} /></div>
    </div>
  );
}

function ProgressCard({ snapshot }: { snapshot: DebugSnapshot }) {
  const total = snapshot.sentences.length;
  const generated = snapshot.sentences.filter(sentence => sentence.durationSec !== null).length;
  const percent = (count: number) => (total ? (count / total) * 100 : 0);
  return (
    <div className="card">
      <div className="card-label">Position</div>
      <div className="card-value">
        {total ? snapshot.currentIndex + 1 : 0}<span className="card-of"> / {total}</span>
      </div>
      <div className="progress" title={`${generated} of ${total} generated`}>
        <span className="progress-generated" style={{ width: `${percent(generated)}%` }} />
        <span className="progress-played" style={{ width: `${percent(total ? snapshot.currentIndex : 0)}%` }} />
      </div>
    </div>
  );
}

function FlagChips({ snapshot }: { snapshot: DebugSnapshot }) {
  const active = Object.entries(snapshot.flags).filter(([, on]) => on).map(([name]) => name);
  return (
    <div className="chips">
      {active.length === 0 && <span className="chip chip-idle">idle</span>}
      {active.map(name => <span key={name} className={`chip chip-${name}`}>{name}</span>)}
      <span className="chip chip-id" title="Read id">{snapshot.readId?.slice(0, 8) ?? "no read"}</span>
    </div>
  );
}

function Overview({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <div className="overview">
      <FlagChips snapshot={snapshot} />
      <div className="cards">
        <ProgressCard snapshot={snapshot} />
        <SpeedCard factor={realtimeFactor(snapshot.sentences)} />
        <StartCard timing={snapshot.startTiming} />
      </div>
    </div>
  );
}

// --- Shell ---

function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="tabs" style={{ ["--tab-index" as string]: TABS.indexOf(tab) }}>
      <span className="tab-indicator" aria-hidden="true" />
      {TABS.map(name => (
        <button key={name} className={name === tab ? "active" : ""} onClick={() => onChange(name)}>
          {name[0].toUpperCase() + name.slice(1)}
        </button>
      ))}
    </nav>
  );
}

function MinimizedPill({ snapshot, onExpand }: { snapshot: DebugSnapshot; onExpand: () => void }) {
  const factor = realtimeFactor(snapshot.sentences);
  return (
    <button className="pill" onClick={onExpand} title="Expand debug panel">
      <StatusOrb mood={playbackMood(snapshot)} />
      <span>{snapshot.sentences.length ? `${snapshot.currentIndex + 1}/${snapshot.sentences.length}` : "debug"}</span>
      {factor !== null && <span className="pill-dim">{factor.toFixed(2)}×</span>}
    </button>
  );
}

export function DebugPanel({ getSnapshot, getConfig, onSeek, onClose }: DebugPanelProps) {
  const snapshot = usePolled(getSnapshot, POLL_INTERVAL_MS);
  const [tab, setTab] = useState<Tab>("sentences");
  const [minimized, setMinimized] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const { position, handlers } = useDrag(panel);
  const placement = position ? { left: position.x, top: position.y, bottom: "auto" } : undefined;

  if (minimized) {
    return <div className="dock" style={placement}><MinimizedPill snapshot={snapshot} onExpand={() => setMinimized(false)} /></div>;
  }
  return (
    <div className="panel" ref={panel} style={placement}>
      <header {...handlers}>
        <StatusOrb mood={playbackMood(snapshot)} />
        <span className="title">Read it!</span>
        <span className="badge">debug</span>
        <span className="spacer" />
        <button className="icon" onClick={() => setMinimized(true)} title="Minimize">–</button>
        <button className="icon" onClick={onClose} title="Close (Alt+Shift+D to reopen)">✕</button>
      </header>
      <Overview snapshot={snapshot} />
      <TabBar tab={tab} onChange={setTab} />
      <div className="tab-body" key={tab}>
        {tab === "sentences" && <SentencesTab snapshot={snapshot} onSeek={onSeek} />}
        {tab === "events" && <EventsTab snapshot={snapshot} />}
        {tab === "config" && <ConfigTab getConfig={getConfig} />}
      </div>
    </div>
  );
}
