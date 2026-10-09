import { useEffect, useRef } from "react";
import type { DebugEvent, DebugSentence, DebugSnapshot } from "./debugData";
import { describeElement, flashOutline, type DebugConfig } from "./debugConfig";
import { formatSeconds, usePolled } from "./debugHooks";

// Counting every noise selector's matches is heavier, so the Config tab polls slower
const CONFIG_POLL_INTERVAL_MS = 1000;

// --- Sentences ---

const STATUS_TITLE: Record<DebugSentence["status"], string> = {
  waiting: "Waiting to be generated",
  generating: "Generating now",
  ready: "Generated, not played yet",
  playing: "Playing",
  played: "Played",
};

function sentenceTooltip(sentence: DebugSentence): string {
  const lines = [STATUS_TITLE[sentence.status], sentence.text];
  if (sentence.report && sentence.report.spokenText !== sentence.text) {
    lines.push(`Spoken as: ${sentence.report.spokenText}`);
  }
  if (sentence.report) {
    lines.push(`Voice: ${sentence.report.voiceId}`);
  }
  if (sentence.located === "missing") {
    lines.push("Not found on the page: no highlight");
  }
  return lines.join("\n");
}

/** Status dot; keyed by status so it re-mounts (and pops) whenever the status changes. */
function StatusDot({ sentence }: { sentence: DebugSentence }) {
  const status = sentence.report?.failed ? "failed" : sentence.status;
  if (status === "playing") {
    return <span className="eq" aria-label="playing"><i /><i /><i /></span>;
  }
  return <span key={status} className={`dot dot-${status}`} />;
}

function SentenceRow({ sentence, onSeek }: { sentence: DebugSentence; onSeek: (index: number) => void }) {
  const classes = ["sentence", `is-${sentence.status}`, sentence.report?.failed ? "is-failed" : ""];
  return (
    <div className={classes.join(" ")} onClick={() => onSeek(sentence.index)} title={sentenceTooltip(sentence)}>
      <StatusDot sentence={sentence} />
      <span className="num">{sentence.index + 1}</span>
      <span className="text">
        {sentence.quoted && <span className="quote-mark">❝</span>}
        {sentence.text}
      </span>
      {sentence.located === "missing" && <span className="warn-tag" title="Not found on the page">no hl</span>}
      <span className="meta">{sentence.report ? `${Math.round(sentence.report.synthesisMs)} ms` : ""}</span>
      <span className="meta">{sentence.durationSec !== null ? `${sentence.durationSec.toFixed(1)} s` : ""}</span>
    </div>
  );
}

export function SentencesTab({ snapshot, onSeek }: { snapshot: DebugSnapshot; onSeek: (index: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector(".is-playing")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [snapshot.currentIndex]);
  if (snapshot.sentences.length === 0) {
    return <div className="empty">No read yet. Select text or press Play.</div>;
  }
  return (
    <div className="scroll" ref={list}>
      {snapshot.sentences.map(sentence => <SentenceRow key={sentence.index} sentence={sentence} onSeek={onSeek} />)}
    </div>
  );
}

// --- Events ---

function eventKind(type: string): string {
  if (type === "read started") {
    return "read";
  }
  if (type === "playing" || type === "paused") {
    return type;
  }
  if (type.startsWith("MODEL_")) {
    return "model";
  }
  return type.replace(/^TTS_/, "").toLowerCase().split("_")[0];
}

const EVENT_LABEL: Record<string, string> = {
  TTS_PROGRESS: "Generating",
  TTS_SENTENCE_WAV: "Audio ready",
  TTS_AUDIO_CHUNK: "Chunk done",
  TTS_STREAM_START: "Stream started",
  TTS_STREAM_END: "Stream finished",
  TTS_TIMING: "Start-up timing",
  MODEL_DOWNLOAD_PROGRESS: "Model download",
  MODEL_DOWNLOAD_COMPLETE: "Model downloaded",
  playing: "Playing",
  paused: "Paused",
};

function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replace(/^TTS_/, "").replace(/_/g, " ").toLowerCase();
}

function EventRow({ event }: { event: DebugEvent }) {
  if (event.type === "read started") {
    return <div className="event-read"><span>New read</span></div>;
  }
  return (
    <div className={`event kind-${eventKind(event.type)}`}>
      <span className="event-time">{formatSeconds(event.atMs, 2)}</span>
      <span className="event-dot" />
      <span className="event-type" title={event.type}>{eventLabel(event.type)}</span>
      <span className="event-detail">{event.detail}</span>
    </div>
  );
}

export function EventsTab({ snapshot }: { snapshot: DebugSnapshot }) {
  const total = snapshot.events.length;
  if (total === 0) {
    return <div className="empty">No events yet.</div>;
  }
  // Newest first. Keys count from the oldest event, so only new rows mount (and slide in).
  return (
    <div className="scroll timeline">
      {snapshot.events.slice().reverse().map((event, position) => <EventRow key={total - position} event={event} />)}
    </div>
  );
}

// --- Config ---

function ContentCard({ config }: { config: DebugConfig }) {
  const { content } = config;
  return (
    <section className="panel-card">
      <h4>Content area</h4>
      <dl>
        <dt>Source</dt><dd><span className="chip chip-source">{content.kind}</span></dd>
        <dt>Element</dt>
        <dd>
          <code>{describeElement(content.root)}</code>
          {content.root && <button className="ghost" onClick={() => flashOutline(content.root)}>Show</button>}
        </dd>
        <dt>Text</dt><dd>{content.textLength.toLocaleString()} chars</dd>
        <dt>Saved</dt><dd><code>{config.savedContentSelector ?? "—"}</code></dd>
      </dl>
    </section>
  );
}

function RulesCard({ config }: { config: DebugConfig }) {
  return (
    <section className="panel-card">
      <h4>Text rules <span className="h4-dim">matches in this read</span></h4>
      {config.rules.length === 0 && <div className="empty-inline">No rules</div>}
      {config.rules.map(({ rule, matches }, position) => {
        const state = matches === null ? "bad" : !rule.enabled ? "off" : matches > 0 ? "hit" : "";
        return (
          <div key={position} className={`rule rule-${state}`}>
            <span className="count">{matches === null ? "invalid" : rule.enabled ? `${matches}×` : "off"}</span>
            <code>/{rule.pattern}/{rule.flags ?? "gi"}</code>
            <span className="arrow">→</span>
            <span className="replacement">{rule.replacement}</span>
          </div>
        );
      })}
    </section>
  );
}

function NoiseCard({ config }: { config: DebugConfig }) {
  return (
    <section className="panel-card">
      <h4>Noise selectors <span className="h4-dim">matches on page</span></h4>
      <div className="noise-grid">
        {config.noise.map(({ selector, pickedOnSite, pageMatches }) => {
          const state = pageMatches === null ? "bad" : pageMatches === 0 ? "off" : "hit";
          return (
            <span key={`${pickedOnSite}-${selector}`} className={`noise noise-${state}`}
              title={pickedOnSite ? "Picked on this site" : "Global setting"}>
              <code>{selector}</code>
              <b>{pageMatches === null ? "invalid" : pageMatches}</b>
              {pickedOnSite && <em>(picked on site)</em>}
            </span>
          );
        })}
      </div>
    </section>
  );
}

export function ConfigTab({ getConfig }: { getConfig: () => DebugConfig }) {
  const config = usePolled(getConfig, CONFIG_POLL_INTERVAL_MS);
  return (
    <div className="scroll config">
      <ContentCard config={config} />
      <RulesCard config={config} />
      <NoiseCard config={config} />
    </div>
  );
}
