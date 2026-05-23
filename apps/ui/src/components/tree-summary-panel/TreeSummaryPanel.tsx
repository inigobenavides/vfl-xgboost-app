/**
 * TreeSummaryPanel — live per-tree narrative that updates as each tree finishes.
 *
 * Shows three sections derived from the latest completed tree (i.e., the tree
 * whose auc_delta has fired at or before eventIndex):
 *
 * 1. "Latest tree" header — tree index, AUC, and AUC delta vs the previous tree.
 * 2. Top split features — the non-leaf nodes sorted by gain descending.
 * 3. Leaf weight range — min/max leaf weights to show the score spread.
 *
 * All values update reactively as playback advances so the panel narrates
 * "tree N just trained on feature X with gain Y" during Act 2.
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SplitRow {
  feature: string;
  gain: number;
  nSamples: number;
}

interface TreeSummary {
  treeIndex: number;
  auc: number;
  aucDelta: number | null; // null for tree 0 (no predecessor)
  topSplits: SplitRow[];   // top 5 by gain, non-leaf nodes only
  minLeaf: number | null;
  maxLeaf: number | null;
  nNodes: number;
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

/** Returns the latest completed tree index visible at eventIndex.
 *  "Completed" means its auc_delta has fired. */
function deriveLatestTree(
  events: TraceEvent[],
  eventIndex: number,
): TreeSummary | null {
  // Collect auc_delta events up to eventIndex
  const aucPoints: Array<{ treeIndex: number; auc: number }> = [];
  for (let i = 0; i <= eventIndex && i < events.length; i++) {
    const e = events[i];
    if (e.type === "auc_delta") {
      aucPoints.push({ treeIndex: e.tree_index, auc: e.auc });
    }
  }
  if (aucPoints.length === 0) return null;

  const latest = aucPoints[aucPoints.length - 1];
  const prev = aucPoints.length >= 2 ? aucPoints[aucPoints.length - 2] : null;

  // Gather node_expanded events for this tree from all events (topology is
  // always visible in full once the tree is complete; we read from ALL events,
  // not from [0..eventIndex], because the tree_start/node_expanded events
  // precede the auc_delta event in the stream — by the time auc_delta fires,
  // all its nodes have already been emitted and are visible at eventIndex).
  const splits: SplitRow[] = [];
  const leafWeights: number[] = [];
  let nNodes = 0;

  for (let i = 0; i <= eventIndex && i < events.length; i++) {
    const e = events[i];
    if (e.type !== "node_expanded" || e.tree_index !== latest.treeIndex) {
      continue;
    }
    nNodes++;
    if (e.is_leaf) {
      if (e.leaf_weight !== null) leafWeights.push(e.leaf_weight);
    } else {
      if (e.feature_id !== null && e.gain !== null) {
        splits.push({
          feature: e.feature_id,
          gain: e.gain,
          nSamples: e.n_samples,
        });
      }
    }
  }

  // Sort descending by gain and take top 5
  splits.sort((a, b) => b.gain - a.gain);
  const topSplits = splits.slice(0, 5);

  return {
    treeIndex: latest.treeIndex,
    auc: latest.auc,
    aucDelta: prev !== null ? latest.auc - prev.auc : null,
    topSplits,
    minLeaf: leafWeights.length > 0 ? Math.min(...leafWeights) : null,
    maxLeaf: leafWeights.length > 0 ? Math.max(...leafWeights) : null,
    nNodes,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Colour the AUC delta — green for gain, red for slight regression. */
function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta >= 0;
  const formatted = (positive ? "+" : "") + (delta * 100).toFixed(2) + "%";
  return (
    <span
      className={`text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded-chip ${
        positive
          ? "text-host bg-host-soft/20 border border-host-soft/40"
          : "text-private bg-private/10 border border-private/30"
      }`}
    >
      {formatted}
    </span>
  );
}

/** Single row in the top-splits table. */
function SplitRow({ feature, gain, nSamples, maxGain }: SplitRow & { maxGain: number }) {
  const barPct = maxGain > 0 ? (gain / maxGain) * 100 : 0;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-0.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] text-fore-1 truncate font-mono">
          {feature}
        </span>
        <div className="relative h-1 bg-ink-3 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-public/60 rounded-full"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
      <span className="text-[9px] text-mute-2 tabular-nums font-mono text-right whitespace-nowrap">
        {gain >= 1000 ? (gain / 1000).toFixed(1) + "k" : gain.toFixed(0)}
      </span>
      <span className="text-[9px] text-mute-1 tabular-nums font-mono text-right whitespace-nowrap">
        {nSamples >= 1000 ? (nSamples / 1000).toFixed(1) + "k" : String(nSamples)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TreeSummaryPanel — public export
// ---------------------------------------------------------------------------

interface TreeSummaryPanelProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function TreeSummaryPanel({ events, eventIndex }: TreeSummaryPanelProps) {
  const summary = useMemo(
    () => deriveLatestTree(events, eventIndex),
    [events, eventIndex],
  );

  const maxGain =
    summary && summary.topSplits.length > 0
      ? summary.topSplits[0].gain
      : 1;

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <p className="text-[10px] font-mono text-mute-1 uppercase tracking-wider">
        Latest tree
      </p>

      <AnimatePresence mode="wait">
        {summary === null ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[10px] font-mono text-mute-1 italic"
          >
            Waiting for first tree…
          </motion.div>
        ) : (
          <motion.div
            key={summary.treeIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3"
          >
            {/* ── Tree header row ── */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[11px] text-mute-2 font-mono">
                tree&nbsp;
                <span className="text-fore-2 font-bold">{summary.treeIndex}</span>
              </span>
              <span className="text-[11px] font-mono text-public tabular-nums">
                AUC&nbsp;{summary.auc.toFixed(4)}
              </span>
              {summary.aucDelta !== null && (
                <DeltaBadge delta={summary.aucDelta} />
              )}
              <span className="text-[9px] text-mute-1 font-mono ml-auto">
                {summary.nNodes}&nbsp;nodes
              </span>
            </div>

            {/* ── Top splits table ── */}
            {summary.topSplits.length > 0 ? (
              <div className="flex flex-col gap-0">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 pb-1 border-b border-line-1">
                  <span className="text-[8px] font-mono text-mute-1 uppercase tracking-wider">feature</span>
                  <span className="text-[8px] font-mono text-mute-1 uppercase tracking-wider text-right">gain</span>
                  <span className="text-[8px] font-mono text-mute-1 uppercase tracking-wider text-right">n</span>
                </div>
                {summary.topSplits.map((row) => (
                  <SplitRow
                    key={row.feature + row.gain}
                    {...row}
                    maxGain={maxGain}
                  />
                ))}
              </div>
            ) : (
              <span className="text-[10px] font-mono text-mute-1 italic">
                No splits yet
              </span>
            )}

            {/* ── Leaf weight range ── */}
            {summary.minLeaf !== null && summary.maxLeaf !== null && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-mono text-mute-1 uppercase tracking-wider">
                  leaf weights
                </span>
                <span className="text-[9px] font-mono text-mute-2 tabular-nums">
                  [{summary.minLeaf.toFixed(3)},&nbsp;{summary.maxLeaf.toFixed(3)}]
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
