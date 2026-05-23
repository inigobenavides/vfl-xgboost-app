/**
 * ReconstructionBeat — the reconstruction-hold centrepiece animation.
 *
 * Two opaque share-pills converge from opposite sides, fuse, then reveal
 * the G/H per-bucket histogram from the ReconstructionAggregateEvent.
 * Driven by holdMsRemaining (decrements with RAF ticks → pausing freezes it).
 *
 * Mount/unmount is controlled by the parent (PlayerApp) via AnimatePresence.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { RECONSTRUCTION_HOLD_MS } from "../../lib/playback";
import type {
  ProtocolMessageEvent,
  ReconstructionAggregateEvent,
  TraceEvent,
} from "../../lib/trace-reader";
import { JargonTerm } from "../ui/Tooltip";
import { TOOLTIPS } from "../../lib/tooltips";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOISE_ID = "rb-noise";

// Phase boundaries (0 = beat starts, 1 = beat ends)
const PILL_EXIT_THRESHOLD = 0.38;
const HISTOGRAM_ENTER_THRESHOLD = 0.30;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

interface BeatData {
  recon: ReconstructionAggregateEvent;
  leftPill: string; // label for pill converging from the left (guest share)
  rightPill: string; // label for pill converging from the right (host share)
}

function formatPillLabel(e: ProtocolMessageEvent): string {
  const typeMap: Record<string, string> = {
    GradientShareResponse: "grad_share",
    HistogramShareResponse: "hist_share",
    SplitDecision: "split_dec",
    ApplySplitRequest: "apply_split",
  };
  const name = typeMap[e.payload_type] ?? e.payload_type.toLowerCase().slice(0, 12);
  const shape = e.payload_shape.join("×");
  return `${name}: int64[${shape}]`;
}

function useBeatData(events: TraceEvent[]): BeatData | null {
  return useMemo(() => {
    // Find reconstruction chapter_marker index
    const reconIdx = events.findIndex(
      (e) => e.type === "chapter_marker" && e.chapter === "reconstruction",
    );
    if (reconIdx < 0) return null;

    // ReconstructionAggregateEvent is immediately after the chapter_marker
    const reconAgg = events
      .slice(reconIdx, reconIdx + 5)
      .find((e): e is ReconstructionAggregateEvent => e.type === "reconstruction_aggregate");
    if (!reconAgg) return null;

    // Find the two most recent protocol_message events before the marker
    const prevMessages = events
      .slice(0, reconIdx)
      .filter((e): e is ProtocolMessageEvent => e.type === "protocol_message")
      .slice(-4);

    const gradMsg = [...prevMessages]
      .reverse()
      .find((e) => e.payload_type === "GradientShareResponse");
    const histMsg = [...prevMessages]
      .reverse()
      .find((e) => e.payload_type === "HistogramShareResponse");

    const leftPill = gradMsg ? formatPillLabel(gradMsg) : "grad_share: int64[...]";
    const rightPill = histMsg ? formatPillLabel(histMsg) : "hist_share: int64[...]";

    return { recon: reconAgg, leftPill, rightPill };
  }, [events]);
}

function normalise(arr: number[]): number[] {
  const absMax = Math.max(...arr.map(Math.abs), 1e-9);
  return arr.map((v) => v / absMax);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WirePill({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded border border-wire/50 px-2 py-0.5 bg-transparent">
      <svg
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <rect width="100%" height="100%" filter={`url(#${NOISE_ID})`} />
      </svg>
      <span className="relative z-10 text-[9px] font-mono text-wire whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function HistogramBars({ values, colour }: { values: number[]; colour: string }) {
  return (
    <div className="flex items-end gap-px h-14 overflow-hidden">
      {values.map((v, i) => (
        <motion.div
          key={i}
          className={`flex-1 rounded-t-sm ${colour}`}
          style={{ height: `${Math.max(1, Math.abs(v) * 100)}%`, opacity: Math.max(0.15, Math.abs(v)) }}
          initial={{ scaleY: 0, originY: "100%" }}
          animate={{ scaleY: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.008 }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReconstructionBeat
// ---------------------------------------------------------------------------

interface ReconstructionBeatProps {
  events: TraceEvent[];
  holdMsRemaining: number;
}

export function ReconstructionBeat({ events, holdMsRemaining }: ReconstructionBeatProps) {
  const data = useBeatData(events);
  if (!data) return null;

  const progress = Math.max(0, Math.min(1, 1 - holdMsRemaining / RECONSTRUCTION_HOLD_MS));
  const showPills = progress < PILL_EXIT_THRESHOLD;
  const showHistogram = progress >= HISTOGRAM_ENTER_THRESHOLD;

  const gNorm = normalise(data.recon.g_per_bucket);
  const hNorm = normalise(data.recon.h_per_bucket);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Shared noise filter */}
      <svg className="absolute" style={{ width: 0, height: 0, overflow: "hidden" }}>
        <defs>
          <filter id={NOISE_ID} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.82"
              numOctaves="4"
              seed="7"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.96  0 0 0 0 0.62  0 0 0 0 0.04  1.5 0 0 0 -0.4"
            />
          </filter>
        </defs>
      </svg>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" />

      {/* Stage — pills + histogram share a coordinate space */}
      <div className="relative flex flex-col items-center gap-4 w-[520px]">
        {/* Converging pills row */}
        <div className="relative h-7 w-full flex items-center">
          <AnimatePresence>
            {showPills && (
              <>
                {/* Left pill — grad_share converges from guest side */}
                <motion.div
                  key="pill-left"
                  className="absolute"
                  initial={{ x: -260, opacity: 0.9 }}
                  animate={{ x: 40, opacity: 1 }}
                  exit={{ x: 120, opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 130, damping: 18, mass: 0.7 }}
                >
                  <WirePill label={data.leftPill} />
                </motion.div>

                {/* Right pill — hist_share converges from host side */}
                <motion.div
                  key="pill-right"
                  className="absolute right-0"
                  initial={{ x: 260, opacity: 0.9 }}
                  animate={{ x: -40, opacity: 1 }}
                  exit={{ x: -120, opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 130, damping: 18, mass: 0.7 }}
                >
                  <WirePill label={data.rightPill} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Histogram card */}
        <AnimatePresence>
          {showHistogram && (
            <motion.div
              key="histogram"
              className="w-full bg-gray-900 border border-wire/20 rounded-xl px-5 py-4"
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
            >
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs font-bold text-wire uppercase tracking-widest">
                  <JargonTerm content={TOOLTIPS.reconstruction}>Reconstruction</JargonTerm>{" "}
                  Aggregate
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {data.recon.feature_id} · {data.recon.node_id}
                </span>
              </div>

              {/* G per bucket */}
              <div className="mb-3">
                <p className="text-[10px] text-guest mb-1 uppercase tracking-wider">
                  ∑G per bucket ({gNorm.length} buckets)
                </p>
                <HistogramBars values={gNorm} colour="bg-guest/70" />
              </div>

              {/* H per bucket */}
              <div>
                <p className="text-[10px] text-host mb-1 uppercase tracking-wider">
                  ∑H per bucket ({hNorm.length} buckets)
                </p>
                <HistogramBars values={hNorm} colour="bg-host/60" />
              </div>

              <p className="text-[9px] text-gray-600 mt-3">
                Aggregate over samples — no individual row visible
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
