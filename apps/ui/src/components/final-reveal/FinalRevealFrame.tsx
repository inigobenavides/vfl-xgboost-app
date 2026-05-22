/**
 * FinalRevealFrame — the closing composition shown during final-reveal-hold and done.
 *
 * Composed for use as a portfolio screenshot / README hero image:
 *   • 10×10 tree thumbnail grid (all 100 trees)
 *   • Full AUC curve
 *   • Privacy status pills
 *   • Title with AUC value pulled from the trace
 *
 * Mounts when playState.status === "final-reveal-hold" || "done".
 * The Replay overlay appears only when status === "done".
 */

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { hierarchy, tree } from "d3-hierarchy";
import { AucChart } from "../auc-chart/AucChart";
import type { NodeExpandedEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Tree thumbnail — static, no animation
// ---------------------------------------------------------------------------

const TW = 52; // thumbnail width
const TH = 38; // thumbnail height
const TM = 3; // margin inside thumbnail

type N = { id: string; ev: NodeExpandedEvent; ch: N[] };

interface ThumbLayout {
  nodes: { x: number; y: number; isLeaf: boolean }[];
  links: { x1: number; y1: number; x2: number; y2: number }[];
}

function buildThumbLayout(events: TraceEvent[], treeIndex: number): ThumbLayout | null {
  const map = new Map<string, NodeExpandedEvent>();
  for (const e of events) {
    if (e.type === "node_expanded" && e.tree_index === treeIndex) {
      map.set(e.node_id, e);
    }
  }
  if (map.size === 0) return null;

  const nm = new Map<string, N>();
  for (const [id, ev] of map) nm.set(id, { id, ev, ch: [] });
  let root: N | null = null;
  for (const n of nm.values()) {
    if (n.ev.parent_id === null) root = n;
    else nm.get(n.ev.parent_id)?.ch.push(n);
  }
  if (!root) return null;

  const laid = tree<N>().nodeSize([8, 12])(
    hierarchy<N>(root, (d) => (d.ch.length > 0 ? d.ch : null)),
  );

  let minX = Infinity, maxX = -Infinity, maxY = 0;
  laid.each((n) => {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  });

  const usableW = TW - 2 * TM;
  const usableH = TH - 2 * TM;
  const sx = usableW / ((maxX - minX) || 1);
  const sy = usableH / (maxY || 1);

  const nodes: ThumbLayout["nodes"] = [];
  const links: ThumbLayout["links"] = [];
  laid.each((n) => {
    nodes.push({
      x: (n.x - minX) * sx + TM,
      y: n.y * sy + TM,
      isLeaf: n.data.ev.is_leaf,
    });
    if (n.parent) {
      links.push({
        x1: (n.parent.x - minX) * sx + TM,
        y1: n.parent.y * sy + TM,
        x2: (n.x - minX) * sx + TM,
        y2: n.y * sy + TM,
      });
    }
  });

  return { nodes, links };
}

function StaticTreeThumb({
  events,
  treeIndex,
}: {
  events: TraceEvent[];
  treeIndex: number;
}) {
  const layout = useMemo(
    () => buildThumbLayout(events, treeIndex),
    [events, treeIndex],
  );

  return (
    <div
      className="border border-gray-800 rounded bg-gray-900 overflow-hidden flex-shrink-0"
      style={{ width: TW, height: TH }}
    >
      {layout ? (
        <svg width={TW} height={TH}>
          {layout.links.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="#374151"
              strokeWidth={0.6}
            />
          ))}
          {layout.nodes.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.isLeaf ? 1.2 : 1.8}
              fill={n.isLeaf ? "#374151" : "#6b7280"}
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FinalRevealFrame
// ---------------------------------------------------------------------------

interface FinalRevealFrameProps {
  events: TraceEvent[];
  isDone: boolean;
  onReplay: () => void;
}

export function FinalRevealFrame({ events, isDone, onReplay }: FinalRevealFrameProps) {
  const finalAuc = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "auc_delta") return (events[i] as { auc: number }).auc;
    }
    return null;
  }, [events]);

  // All tree indices 0-99
  const treeIndices = useMemo(() => {
    const seen = new Set<number>();
    for (const e of events) {
      if (e.type === "tree_start") seen.add(e.tree_index);
    }
    return Array.from(seen).sort((a, b) => a - b);
  }, [events]);

  return (
    <motion.div
      className="fixed inset-0 bg-gray-950 z-30 flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Title bar */}
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3 border-b border-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">
            VFL XGBoost — UCI Adult
          </h1>
          {finalAuc !== null && (
            <p className="text-public font-mono text-sm mt-0.5">
              AUC{" "}
              <span className="text-lg font-bold">{finalAuc.toFixed(4)}</span>
            </p>
          )}
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded px-2 py-1">
            <span className="text-[10px] font-bold text-guest">Guest ✓</span>
          </div>
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded px-2 py-1">
            <span className="text-[10px] font-bold text-host">Host ✓</span>
          </div>
          <span className="text-[10px] text-gray-500">
            no raw gradients · no raw features
          </span>
        </div>
      </div>

      {/* 10×10 tree grid */}
      <div className="px-6 pt-4 flex-shrink-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
          {treeIndices.length} trees
        </p>
        <div className="grid grid-cols-[repeat(10,auto)] gap-1.5 w-fit">
          {treeIndices.map((ti) => (
            <StaticTreeThumb key={ti} events={events} treeIndex={ti} />
          ))}
        </div>
      </div>

      {/* AUC curve — fills remaining space */}
      <div className="flex-1 px-6 pt-4 pb-2 min-h-0">
        <AucChart events={events} eventIndex={events.length - 1} />
      </div>

      {/* Replay overlay — appears once status is "done" */}
      <AnimatePresence>
        {isDone && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-950/60 backdrop-blur-sm z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-green-400 text-sm font-mono">Replay complete</p>
            <button
              className="flex items-center gap-2 bg-public hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded transition-colors"
              onClick={onReplay}
              aria-label="Replay from start"
            >
              ↻ Replay
            </button>
            <p className="text-[10px] text-gray-500">or press R</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
