/**
 * ReconstructionBeat — the reconstruction-hold centrepiece animation.
 *
 * Two data-packet cards (matching MessageWire's pill style) converge from
 * opposite sides, fuse, then reveal the G/H per-bucket histogram from the
 * ReconstructionAggregateEvent. Driven by holdMsRemaining (decrements with
 * RAF ticks → pausing freezes it).
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

// Phase boundaries (0 = beat starts, 1 = beat ends)
const PILL_EXIT_THRESHOLD = 0.38;
const HISTOGRAM_ENTER_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

interface PillInfo {
  /** Uppercase type label, e.g. "GRAD SHARE". */
  type: string;
  /** Shape including brackets, e.g. "[8×71]". */
  shape: string;
  /** Data type string, e.g. "int64". */
  dtype: string;
}

interface BeatData {
  recon: ReconstructionAggregateEvent;
  leftPill: PillInfo; // pill converging from the guest side
  rightPill: PillInfo; // pill converging from the host side
}

const TYPE_ABBREV: Record<string, string> = {
  GradientShareResponse: "grad_share",
  HistogramShareResponse: "hist_share",
  SplitDecision: "split_dec",
  ApplySplitRequest: "apply_split",
};

function parsePill(e: ProtocolMessageEvent): PillInfo {
  const type = TYPE_ABBREV[e.payload_type] ?? e.payload_type.toLowerCase().slice(0, 12);
  return {
    type,
    shape: `[${e.payload_shape.join("×")}]`,
    dtype: "int64",
  };
}

const FALLBACK_PILL = (type: string): PillInfo => ({
  type,
  shape: "[...]",
  dtype: "int64",
});

function useBeatData(events: TraceEvent[]): BeatData | null {
  return useMemo(() => {
    const reconIdx = events.findIndex(
      (e) => e.type === "chapter_marker" && e.chapter === "reconstruction",
    );
    if (reconIdx < 0) return null;

    const reconAgg = events
      .slice(reconIdx, reconIdx + 5)
      .find((e): e is ReconstructionAggregateEvent => e.type === "reconstruction_aggregate");
    if (!reconAgg) return null;

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

    return {
      recon: reconAgg,
      leftPill: gradMsg ? parsePill(gradMsg) : FALLBACK_PILL("grad_share"),
      rightPill: histMsg ? parsePill(histMsg) : FALLBACK_PILL("hist_share"),
    };
  }, [events]);
}

function normalise(arr: number[]): number[] {
  const absMax = Math.max(...arr.map(Math.abs), 1e-9);
  return arr.map((v) => v / absMax);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Matches MessageWire's PacketCard so the two views feel like one system. */
function PacketCard({ pill }: { pill: PillInfo }) {
  return (
    <div className="relative flex items-stretch bg-ink-2/85 backdrop-blur-sm border border-wire/40 rounded-chip shadow-glow-wire overflow-hidden">
      <div className="w-1 bg-wire" />
      <div className="flex flex-col gap-0.5 px-2 py-1">
        <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-wire whitespace-nowrap">
          {pill.type.replace("_", " ")}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono text-mute-2 bg-ink-3 rounded-chip px-1">
            {pill.dtype}
          </span>
          <span className="text-[8px] font-mono text-mute-2 bg-ink-3 rounded-chip px-1">
            {pill.shape}
          </span>
        </div>
      </div>
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
          style={{
            height: `${Math.max(1, Math.abs(v) * 100)}%`,
            opacity: Math.max(0.15, Math.abs(v)),
          }}
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm" />

      {/* Stage — pills + histogram share a coordinate space */}
      <div className="relative flex flex-col items-center gap-4 w-[520px]">
        {/* Converging pills row */}
        <div className="relative h-9 w-full flex items-center">
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
                  <PacketCard pill={data.leftPill} />
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
                  <PacketCard pill={data.rightPill} />
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
              className="w-full bg-ink-2 border border-line-1 rounded-card shadow-card px-5 py-4"
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
            >
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs font-sans font-semibold text-wire uppercase tracking-widest">
                  <JargonTerm content={TOOLTIPS.reconstruction}>Reconstruction</JargonTerm>{" "}
                  Aggregate
                </span>
                <span className="text-[10px] text-mute-1 font-mono">
                  {data.recon.feature_id} · {data.recon.node_id}
                </span>
              </div>

              {/* G per bucket */}
              <div className="mb-3">
                <p className="text-[10px] font-mono text-guest mb-1 uppercase tracking-wider">
                  ∑G per bucket ({gNorm.length} buckets)
                </p>
                <HistogramBars values={gNorm} colour="bg-guest/70" />
              </div>

              {/* H per bucket */}
              <div>
                <p className="text-[10px] font-mono text-host mb-1 uppercase tracking-wider">
                  ∑H per bucket ({hNorm.length} buckets)
                </p>
                <HistogramBars values={hNorm} colour="bg-host/60" />
              </div>

              <p className="text-[9px] font-mono text-mute-1 mt-3">
                Aggregate over samples — no individual row visible
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
