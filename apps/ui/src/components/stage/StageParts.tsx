/**
 * StageParts — shared sub-components for the protocol-replay "stage"
 * frame. Pulled out of App.tsx so the Act1Layout and Act2Layout
 * composition stories can mirror the production composition without
 * duplicating JSX.
 *
 * Includes:
 *   • OrnamentMark — small L-bracket ornament.
 *   • RibbonHeader — chapter chip · title · run metadata header strip.
 *   • ChapterCaption — plain-English explainer that fades between chapters.
 *   • GuestStatusPill / HostStatusPill — Act-2 attestation cards.
 *   • EmptyTreeScaffold — ghost-tree placeholder when tree-0 has <4 nodes.
 *   • useTreeZeroNodeCount — count of node_expanded events on tree 0.
 *   • STAGE_FRAME_STYLE / STAGE_FRAME_CLASS — the shared stage chrome.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { RunMeta } from "../../lib/runMeta";
import type { TraceEvent } from "../../lib/trace-reader";
import { JargonTerm } from "../ui/Tooltip";
import { TOOLTIPS } from "../../lib/tooltips";

// ---------------------------------------------------------------------------
// Stage frame chrome — used as className+style on the wrapping <section>
// ---------------------------------------------------------------------------

export const STAGE_FRAME_CLASS =
  "relative rounded-stage border border-line-1 shadow-stage p-6 overflow-hidden";

export const STAGE_FRAME_STYLE: CSSProperties = {
  minHeight: 640,
  backgroundColor: "var(--color-ink-1)",
  backgroundImage:
    "repeating-linear-gradient(0deg, transparent 0 23px, color-mix(in srgb, var(--color-line-1) 25%, transparent) 23px 24px)",
};

// ---------------------------------------------------------------------------
// OrnamentMark — L-bracket inline SVG. text-* on parent sets the stroke colour.
// ---------------------------------------------------------------------------

export function OrnamentMark({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2 12 V2 H12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="square"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RibbonHeader — chapter chip · title · run metadata
// ---------------------------------------------------------------------------

export function RibbonHeader({
  chapterName,
  runMeta,
}: {
  chapterName: string;
  runMeta: RunMeta;
}) {
  return (
    <header className="flex items-center gap-6 mb-5">
      <div className="flex items-center gap-2 shrink-0">
        <OrnamentMark className="text-wire/70" />
        <span className="text-xs font-display italic text-mute-2 whitespace-nowrap">
          {chapterName}
        </span>
      </div>
      <h2 className="text-xl font-display font-semibold text-fore-2 flex-1 leading-none">
        VFL XGBoost{" "}
        <span className="text-mute-2 font-normal">— Protocol Replay</span>
      </h2>
      <p className="text-xs font-mono text-mute-2 whitespace-nowrap">
        {runMeta.datasetName} · {runMeta.nTrees} trees · max_depth{" "}
        {runMeta.maxDepth} · run{" "}
        <span className="text-fore-1">{runMeta.runId}</span>
      </p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// ChapterCaption — plain-English explainer that fades between chapters.
// ---------------------------------------------------------------------------

export function ChapterCaption({
  isAct2,
  isReconstruction,
}: {
  isAct2: boolean;
  isReconstruction: boolean;
}) {
  const reducedMotion = useReducedMotion();

  let key: "act1" | "act2" | "reconstruction";
  let body: React.ReactNode;
  if (isReconstruction) {
    key = "reconstruction";
    body = (
      <>
        Pause. The{" "}
        <JargonTerm content={TOOLTIPS.cryptoShare}>shares</JargonTerm> are
        combined to find the best split — without either party ever seeing
        the other's raw signal.
      </>
    );
  } else if (isAct2) {
    key = "act2";
    body = (
      <>
        One tree isn't enough. 99 more train the same way — each correcting
        the last. Watch the <JargonTerm content={TOOLTIPS.auc}>AUC</JargonTerm>{" "}
        climb.
      </>
    );
  } else {
    key = "act1";
    body = (
      <>
        The Guest holds the labels; the Host holds the features. Watch the
        wire as{" "}
        <JargonTerm content={TOOLTIPS.cryptoShare}>crypto shares</JargonTerm>{" "}
        of gradients fly between them — each piece meaningless alone.
      </>
    );
  }

  const transition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 0.32,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      };

  return (
    <div className="mb-4 max-w-[720px]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.p
          key={key}
          className="text-sm font-sans italic text-mute-2 leading-snug"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={transition}
        >
          {body}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pills — Act 2 attestation cards
// ---------------------------------------------------------------------------

export function GuestStatusPill() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-ink-2 border border-line-1 rounded-card px-3 py-2">
        <span className="text-xs font-sans font-semibold text-guest uppercase tracking-widest">
          Guest
        </span>
        <span className="text-host text-xs">✓</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-mono text-mute-1 bg-ink-2 border border-line-1 rounded-chip px-2 py-0.5">
          no raw gradients shared
        </span>
        <span className="text-[9px] font-mono text-mute-1 bg-ink-2 border border-line-1 rounded-chip px-2 py-0.5">
          labels remain private
        </span>
      </div>
    </div>
  );
}

export function HostStatusPill() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-ink-2 border border-line-1 rounded-card px-3 py-2">
        <span className="text-xs font-sans font-semibold text-host uppercase tracking-widest">
          Host
        </span>
        <span className="text-host text-xs">✓</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-mono text-mute-1 bg-ink-2 border border-line-1 rounded-chip px-2 py-0.5">
          no raw features exposed
        </span>
        <span className="text-[9px] font-mono text-mute-1 bg-ink-2 border border-line-1 rounded-chip px-2 py-0.5">
          histograms only
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-tree scaffold — anchors the eye when tree-0 has <4 nodes.
// ---------------------------------------------------------------------------

const GHOST_NODES: Array<{ x: number; y: number; r: number }> = [
  { x: 50, y: 6, r: 4 },
  { x: 26, y: 34, r: 2.6 },
  { x: 74, y: 34, r: 2.6 },
  { x: 12, y: 62, r: 2.2 },
  { x: 40, y: 62, r: 2.2 },
  { x: 60, y: 62, r: 2.2 },
  { x: 88, y: 62, r: 2.2 },
];
const GHOST_LINKS: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [2, 6],
];

export function EmptyTreeScaffold() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col items-center gap-4">
        <svg
          width="200"
          height="140"
          viewBox="0 0 100 70"
          aria-hidden="true"
          className="text-line-2"
        >
          {GHOST_LINKS.map(([from, to], i) => (
            <line
              key={i}
              x1={GHOST_NODES[from].x}
              y1={GHOST_NODES[from].y}
              x2={GHOST_NODES[to].x}
              y2={GHOST_NODES[to].y}
              stroke="currentColor"
              strokeWidth="0.4"
              strokeDasharray="1.5 1.5"
              opacity="0.5"
            />
          ))}
          {GHOST_NODES.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.4"
              strokeDasharray={i === 0 ? "1.5 1.5" : undefined}
              opacity={i === 0 ? 0.7 : 0.4}
            />
          ))}
        </svg>
        <p className="text-xs font-mono text-mute-1 tracking-wider">
          ↳ awaiting first split
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// useTreeZeroNodeCount — drives whether the scaffold is visible.
// ---------------------------------------------------------------------------

export function useTreeZeroNodeCount(
  events: TraceEvent[],
  eventIndex: number,
): number {
  return useMemo(() => {
    let count = 0;
    for (let i = 0; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type === "node_expanded" && e.tree_index === 0) count++;
    }
    return count;
  }, [events, eventIndex]);
}
