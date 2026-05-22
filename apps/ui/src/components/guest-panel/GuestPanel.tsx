/**
 * GuestPanel — symbolic view of the guest party's labels, gradients, and hessians.
 *
 * Data is derived from trace events up to the current eventIndex.
 * All values are shown symbolically (density strips, bar strips) — no raw numbers.
 */

import { useMemo } from "react";
import type { ReconstructionAggregateEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Data derivation
// ---------------------------------------------------------------------------

interface GuestState {
  /** Bucket gradient magnitudes, normalised 0–1. */
  gradients: number[];
  /** Bucket hessian magnitudes, normalised 0–1. */
  hessians: number[];
  /** Positive-class fraction (used for the labels density strip). */
  positiveRatio: number;
  /** Current node's sample count. */
  nSamples: number | null;
}

function useGuestState(events: TraceEvent[], eventIndex: number): GuestState {
  return useMemo(() => {
    let lastReconstruction: ReconstructionAggregateEvent | null = null;
    let positiveLeafCount = 0;
    let negativeLeafCount = 0;
    let nSamples: number | null = null;

    for (let i = 0; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type === "reconstruction_aggregate" && e.tree_index === 0) {
        lastReconstruction = e;
      }
      if (e.type === "node_expanded" && e.tree_index === 0 && e.is_leaf) {
        if ((e.leaf_weight ?? 0) > 0) positiveLeafCount++;
        else negativeLeafCount++;
      }
      if (e.type === "node_expanded" && e.tree_index === 0 && !e.is_leaf) {
        nSamples = e.n_samples;
      }
    }

    const positiveRatio =
      positiveLeafCount + negativeLeafCount > 0
        ? positiveLeafCount / (positiveLeafCount + negativeLeafCount)
        : 0.25; // UCI Adult prior ~25% positive

    if (!lastReconstruction) {
      return { gradients: [], hessians: [], positiveRatio, nSamples };
    }

    const normalise = (arr: number[]): number[] => {
      const absMax = Math.max(...arr.map(Math.abs), 1e-9);
      return arr.map((v) => v / absMax);
    };

    return {
      gradients: normalise(lastReconstruction.g_per_bucket),
      hessians: normalise(lastReconstruction.h_per_bucket),
      positiveRatio,
      nSamples,
    };
  }, [events, eventIndex]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Horizontal bar strip. Each value in [-1, 1]; positive = guest, negative = private. */
function BarStrip({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) {
    return (
      <div>
        <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{label}</p>
        <div className="h-5 w-full rounded bg-gray-800 flex items-center justify-center">
          <span className="text-[9px] text-gray-600">waiting…</span>
        </div>
      </div>
    );
  }

  const barW = Math.max(2, Math.floor(200 / values.length));

  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{label}</p>
      <div className="flex items-end gap-px h-8 overflow-hidden rounded">
        {values.map((v, i) => {
          const h = Math.round(Math.abs(v) * 100);
          const isPos = v >= 0;
          return (
            <div
              key={i}
              className={`flex-shrink-0 rounded-sm ${isPos ? "bg-guest" : "bg-private"}`}
              style={{ width: barW, height: `${Math.max(4, h)}%`, opacity: 0.7 + 0.3 * Math.abs(v) }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Vertical density strip showing class balance. */
function LabelStrip({ positiveRatio }: { positiveRatio: number }) {
  const posH = Math.round(positiveRatio * 100);
  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Labels</p>
      <div className="flex h-20 w-8 flex-col rounded overflow-hidden">
        <div className="bg-guest" style={{ flex: posH }} />
        <div className="bg-gray-700" style={{ flex: 100 - posH }} />
      </div>
      <p className="text-[9px] text-gray-500 mt-1">
        {Math.round(positiveRatio * 100)}% pos
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuestPanel
// ---------------------------------------------------------------------------

interface GuestPanelProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function GuestPanel({ events, eventIndex }: GuestPanelProps) {
  const gs = useGuestState(events, eventIndex);

  return (
    <div className="flex flex-col gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-guest uppercase tracking-widest">Guest</span>
        {gs.nSamples !== null && (
          <span className="text-[10px] text-gray-500">{gs.nSamples} samples</span>
        )}
      </div>

      {/* Labels + gradient strips side by side */}
      <div className="flex gap-3 items-start">
        <LabelStrip positiveRatio={gs.positiveRatio} />
        <div className="flex-1 flex flex-col gap-3">
          <BarStrip values={gs.gradients} label="Gradients (g)" />
          <BarStrip values={gs.hessians} label="Hessians (h)" />
        </div>
      </div>

      {/* Outbox lane placeholder */}
      <div className="mt-auto">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Outbox</p>
        <div className="h-6 border border-dashed border-gray-800 rounded flex items-center justify-center">
          <span className="text-[9px] text-gray-700">share pills → slice 7</span>
        </div>
      </div>
    </div>
  );
}
