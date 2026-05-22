import { useEffect, useRef, type MouseEvent } from "react";
import { buildConfig, currentChapterIndex, SPEEDS, type Speed } from "../../lib/playback";
import { usePlayback } from "../../lib/usePlayback";
import type { TraceEvent, ChapterName } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Chapter display names
// ---------------------------------------------------------------------------

const CHAPTER_LABELS: Record<ChapterName, string> = {
  act1_start: "Act 1 — Tree 0",
  reconstruction: "Reconstruction",
  act2_start: "Act 2 — Trees 1-99",
  final: "Final Reveal",
};

// ---------------------------------------------------------------------------
// Scrubber with chapter ticks
// ---------------------------------------------------------------------------

interface ScrubberProps {
  eventIndex: number;
  totalEvents: number;
  chapterOffsets: { name: ChapterName; eventIndex: number }[];
  onScrub: (eventIndex: number) => void;
}

function Scrubber({ eventIndex, totalEvents, chapterOffsets, onScrub }: ScrubberProps) {
  const progress = totalEvents > 1 ? eventIndex / (totalEvents - 1) : 0;

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (totalEvents - 1));
    onScrub(idx);
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Track */}
      <div
        role="slider"
        aria-valuenow={eventIndex}
        aria-valuemin={0}
        aria-valuemax={totalEvents - 1}
        aria-label="Playback position"
        tabIndex={0}
        className="relative h-2 w-full cursor-pointer rounded-full bg-gray-700"
        onClick={handleClick}
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-public transition-none"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Chapter tick marks */}
        {chapterOffsets.map((ch) => {
          const pos = (ch.eventIndex / (totalEvents - 1)) * 100;
          return (
            <div
              key={ch.name}
              className="absolute -top-1 h-4 w-0.5 bg-wire opacity-80"
              style={{ left: `${pos}%` }}
              title={CHAPTER_LABELS[ch.name]}
            />
          );
        })}
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      {/* Chapter tick labels */}
      <div className="relative h-4 w-full">
        {chapterOffsets.map((ch, i) => {
          const pos = (ch.eventIndex / (totalEvents - 1)) * 100;
          const isRight = pos > 70;
          return (
            <span
              key={ch.name}
              className="absolute text-[10px] text-gray-400 whitespace-nowrap"
              style={{
                left: `${pos}%`,
                transform: isRight
                  ? "translateX(-100%)"
                  : i === 0
                    ? "translateX(0)"
                    : "translateX(-50%)",
              }}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

interface HudProps {
  events: TraceEvent[];
  /** When true the HUD renders but is invisible (title card is on top). */
  hidden?: boolean;
  /** Called once when the playback state machine reaches "done". */
  onDone?: () => void;
}

export function Hud({ events, hidden = false, onDone }: HudProps) {
  const [state, dispatch] = usePlayback(events);
  const config = buildConfig(events);

  // Notify parent when we reach done — fire once via a ref guard
  const doneNotified = useRef(false);
  useEffect(() => {
    if (state.status === "done" && !doneNotified.current) {
      doneNotified.current = true;
      onDone?.();
    }
    if (state.status !== "done") doneNotified.current = false;
  }, [state.status, onDone]);

  const isPlaying = state.status === "playing";
  const isDone = state.status === "done";
  const isHolding =
    state.status === "reconstruction-hold" || state.status === "final-reveal-hold";

  const chapterIdx = currentChapterIndex(state.eventIndex, config.chapterOffsets);
  const chapterLabel =
    chapterIdx >= 0
      ? CHAPTER_LABELS[config.chapterOffsets[chapterIdx].name]
      : "—";

  const currentEvent = events[state.eventIndex];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 py-3 flex flex-col gap-3${hidden ? " invisible" : ""}`}
      aria-hidden={hidden}
    >
      {/* Scrubber */}
      <Scrubber
        eventIndex={state.eventIndex}
        totalEvents={config.totalEvents}
        chapterOffsets={config.chapterOffsets}
        onScrub={(idx) => dispatch({ type: "scrub", eventIndex: idx })}
      />

      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Step back */}
        <button
          className="rounded px-2 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 font-mono"
          onClick={() => dispatch({ type: "step-back" })}
          title="Step back (←)"
          aria-label="Step back"
        >
          ‹
        </button>

        {/* Play / Pause */}
        <button
          className={`rounded px-3 py-1 text-sm font-semibold ${
            isDone
              ? "text-gray-500 cursor-not-allowed"
              : "bg-public text-white hover:bg-blue-500"
          }`}
          onClick={() =>
            dispatch(isPlaying ? { type: "pause" } : { type: "play" })
          }
          disabled={isDone}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying || isHolding ? "⏸" : isDone ? "✓" : "▶"}
        </button>

        {/* Step forward */}
        <button
          className="rounded px-2 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 font-mono"
          onClick={() => dispatch({ type: "step-forward" })}
          title="Step forward (→)"
          aria-label="Step forward"
        >
          ›
        </button>

        {/* Chapter back */}
        <button
          className="rounded px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
          onClick={() => dispatch({ type: "jump-chapter", direction: "back" })}
          title="Chapter back (J)"
          aria-label="Chapter back"
        >
          ⏮
        </button>

        {/* Chapter forward */}
        <button
          className="rounded px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
          onClick={() => dispatch({ type: "jump-chapter", direction: "forward" })}
          title="Chapter forward (K)"
          aria-label="Chapter forward"
        >
          ⏭
        </button>

        {/* Restart */}
        <button
          className="rounded px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
          onClick={() => dispatch({ type: "restart" })}
          title="Restart (R)"
          aria-label="Restart"
        >
          ↺
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-700" />

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`rounded px-2 py-0.5 text-xs ${
                state.speed === s
                  ? "bg-gray-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
              onClick={() => dispatch({ type: "set-speed", speed: s as Speed })}
              aria-label={`${s}× speed`}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-700" />

        {/* Chapter label */}
        <span className="text-xs text-wire font-semibold">{chapterLabel}</span>

        {/* Status badge */}
        {isHolding && (
          <span className="text-xs text-private animate-pulse">
            {state.status === "reconstruction-hold" ? "Reconstruction hold…" : "Final reveal…"}
          </span>
        )}
        {isDone && <span className="text-xs text-green-400">Done</span>}

        {/* Event counter */}
        <span className="ml-auto text-xs text-gray-500 tabular-nums">
          {state.eventIndex + 1} / {config.totalEvents}
        </span>
      </div>

      {/* Debug line — current event type */}
      <div className="text-xs text-gray-500 font-mono truncate">
        <span className="text-gray-600">event[{state.eventIndex}]</span>
        {" → "}
        <span className="text-host">{currentEvent?.type ?? "—"}</span>
        {currentEvent?.type === "chapter_marker" && (
          <span className="text-wire"> · {currentEvent.chapter}</span>
        )}
        {currentEvent?.type === "tree_start" && (
          <span className="text-guest"> · tree {currentEvent.tree_index}</span>
        )}
        {currentEvent?.type === "auc_delta" && (
          <span className="text-public"> · AUC {currentEvent.auc.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
}
