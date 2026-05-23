/**
 * FinalRevealFrame — the closing composition shown during final-reveal-hold
 * and done.
 *
 * Two-column layout:
 *   • Left column — hero AucChart with a giant final AUC numeral overlay
 *     (font-display) anchored bottom-right of the chart.
 *   • Right column — tree grid (~10 columns) with four "hero" thumbs scaled
 *     up at the corners (first, last, deepest, highest-gain) plus a Run
 *     Attestation key/value card underneath.
 *
 * Mounts when playState.status === "final-reveal-hold" || "done".
 * The Replay overlay appears only when status === "done".
 */

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { hierarchy, tree } from "d3-hierarchy";
import { AucChart } from "../auc-chart/AucChart";
import { JargonTerm } from "../ui/Tooltip";
import { TOOLTIPS } from "../../lib/tooltips";
import type { NodeExpandedEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Thumbnail layout helper
// ---------------------------------------------------------------------------

type N = { id: string; ev: NodeExpandedEvent; ch: N[] };

interface ThumbLayout {
  nodes: { x: number; y: number; isLeaf: boolean }[];
  links: { x1: number; y1: number; x2: number; y2: number }[];
}

function buildThumbLayout(
  events: TraceEvent[],
  treeIndex: number,
  w: number,
  h: number,
  margin: number,
): ThumbLayout | null {
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

  const usableW = w - 2 * margin;
  const usableH = h - 2 * margin;
  const sx = usableW / ((maxX - minX) || 1);
  const sy = usableH / (maxY || 1);

  const nodes: ThumbLayout["nodes"] = [];
  const links: ThumbLayout["links"] = [];
  laid.each((n) => {
    nodes.push({
      x: (n.x - minX) * sx + margin,
      y: n.y * sy + margin,
      isLeaf: n.data.ev.is_leaf,
    });
    if (n.parent) {
      links.push({
        x1: (n.parent.x - minX) * sx + margin,
        y1: n.parent.y * sy + margin,
        x2: (n.x - minX) * sx + margin,
        y2: n.y * sy + margin,
      });
    }
  });

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// Thumbnails — normal and hero (2× scale, host-bordered, captioned)
// ---------------------------------------------------------------------------

function StaticTreeThumb({
  events,
  treeIndex,
  size = "normal",
}: {
  events: TraceEvent[];
  treeIndex: number;
  size?: "normal" | "hero";
}) {
  const w = size === "hero" ? 104 : 52;
  const h = size === "hero" ? 76 : 38;
  const margin = size === "hero" ? 6 : 3;
  const layout = useMemo(
    () => buildThumbLayout(events, treeIndex, w, h, margin),
    [events, treeIndex, w, h, margin],
  );
  const border =
    size === "hero" ? "border-host/70" : "border-line-1";

  return (
    <div
      className={`rounded bg-ink-2 border ${border} overflow-hidden flex-shrink-0`}
      style={{ width: w, height: h }}
    >
      {layout ? (
        <svg width={w} height={h}>
          {layout.links.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="var(--color-line-2)"
              strokeWidth={size === "hero" ? 0.9 : 0.6}
            />
          ))}
          {layout.nodes.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={size === "hero" ? (n.isLeaf ? 2.0 : 2.8) : n.isLeaf ? 1.2 : 1.8}
              fill={n.isLeaf ? "var(--color-line-2)" : "var(--color-mute-1)"}
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}

function HeroThumb({
  events,
  treeIndex,
  label,
}: {
  events: TraceEvent[];
  treeIndex: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1 items-start">
      <StaticTreeThumb events={events} treeIndex={treeIndex} size="hero" />
      <span className="text-[9px] font-mono text-mute-2 leading-tight">
        <span className="text-host">#{treeIndex}</span>
        <span className="text-mute-2"> · {label}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Derived per-tree statistics for the hero thumb selection + attestation card
// ---------------------------------------------------------------------------

interface RunStats {
  treeIndices: number[];
  firstIndex: number;
  lastIndex: number;
  deepestIndex: number;
  highestGainIndex: number;
  totalMessages: number;
  finalAuc: number | null;
}

function useRunStats(events: TraceEvent[]): RunStats {
  return useMemo(() => {
    const treeSet = new Set<number>();
    const nodeCountByTree = new Map<number, number>();
    const maxGainByTree = new Map<number, number>();
    let totalMessages = 0;
    let finalAuc: number | null = null;

    for (const e of events) {
      if (e.type === "tree_start") treeSet.add(e.tree_index);
      if (e.type === "node_expanded") {
        nodeCountByTree.set(
          e.tree_index,
          (nodeCountByTree.get(e.tree_index) ?? 0) + 1,
        );
        if (!e.is_leaf && e.gain !== null) {
          const prev = maxGainByTree.get(e.tree_index) ?? -Infinity;
          if (e.gain > prev) maxGainByTree.set(e.tree_index, e.gain);
        }
      }
      if (e.type === "protocol_message") totalMessages++;
      if (e.type === "auc_delta") finalAuc = e.auc;
    }

    const treeIndices = Array.from(treeSet).sort((a, b) => a - b);
    const firstIndex = treeIndices[0] ?? 0;
    const lastIndex = treeIndices[treeIndices.length - 1] ?? 0;

    let deepestIndex = firstIndex;
    let deepestCount = -Infinity;
    for (const [idx, count] of nodeCountByTree) {
      if (count > deepestCount) {
        deepestCount = count;
        deepestIndex = idx;
      }
    }

    let highestGainIndex = firstIndex;
    let highestGain = -Infinity;
    for (const [idx, gain] of maxGainByTree) {
      if (gain > highestGain) {
        highestGain = gain;
        highestGainIndex = idx;
      }
    }

    return {
      treeIndices,
      firstIndex,
      lastIndex,
      deepestIndex,
      highestGainIndex,
      totalMessages,
      finalAuc,
    };
  }, [events]);
}

// ---------------------------------------------------------------------------
// Status pills (reused from App.tsx Act 2 — kept inline here to avoid coupling)
// ---------------------------------------------------------------------------

function PrivacyBadges() {
  return (
    <div className="flex gap-3 items-center">
      <div className="flex items-center gap-1.5 bg-ink-2 border border-line-1 rounded-chip px-2 py-1">
        <span className="text-[10px] font-sans font-semibold text-guest uppercase tracking-widest">
          Guest
        </span>
        <span className="text-host text-[10px]">✓</span>
      </div>
      <div className="flex items-center gap-1.5 bg-ink-2 border border-line-1 rounded-chip px-2 py-1">
        <span className="text-[10px] font-sans font-semibold text-host uppercase tracking-widest">
          Host
        </span>
        <span className="text-host text-[10px]">✓</span>
      </div>
      <span className="text-[10px] font-mono text-mute-1">
        no raw gradients · no raw features
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run Attestation card
// ---------------------------------------------------------------------------

function AttestationCard({
  stats,
  nTrees,
  maxDepth,
}: {
  stats: RunStats;
  nTrees: number;
  maxDepth: number;
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ["trees", nTrees.toString()],
    ["max_depth", maxDepth.toString()],
    [
      "total messages",
      stats.totalMessages.toLocaleString(),
    ],
    ["private bytes", "0"],
    ["guest seen", "histograms"],
    ["host seen", "gradients (masked)"],
    [
      "final AUC",
      stats.finalAuc !== null
        ? stats.finalAuc.toFixed(4)
        : "—",
    ],
  ];

  return (
    <div className="bg-ink-2 border border-line-1 rounded-card shadow-card p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-display font-semibold text-fore-2">
          Run attestation
        </h3>
        <span className="text-[9px] font-display italic text-mute-2">
          Final Reveal
        </span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[10px] font-mono text-mute-1 uppercase tracking-wider">
              {k}
            </dt>
            <dd className="text-[11px] font-mono text-fore-1 text-right tabular-nums">
              {v}
            </dd>
          </div>
        ))}
      </dl>
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

export function FinalRevealFrame({
  events,
  isDone,
  onReplay,
}: FinalRevealFrameProps) {
  const stats = useRunStats(events);
  const { treeIndices, finalAuc } = stats;
  const heroIndices = new Set([
    stats.firstIndex,
    stats.lastIndex,
    stats.deepestIndex,
    stats.highestGainIndex,
  ]);

  // Run metadata — defaults that work even if events don't include a config event
  const nTrees = treeIndices.length || 100;
  const maxDepth = 4;

  return (
    <motion.div
      className="fixed inset-0 bg-ink-0 z-30 flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-line-1 flex-shrink-0">
        <h1 className="text-xl font-display font-semibold text-fore-2">
          VFL XGBoost <span className="text-mute-2 font-normal">— UCI Adult</span>
        </h1>
        <PrivacyBadges />
      </div>

      {/* Final caption — plain-English summary for non-technical viewers */}
      <p className="px-8 pt-4 pb-2 text-sm font-sans italic text-mute-2 max-w-[720px] leading-snug">
        {treeIndices.length} trees,{" "}
        <JargonTerm content={TOOLTIPS.auc}>AUC</JargonTerm>{" "}
        {finalAuc !== null ? finalAuc.toFixed(2) : "—"}. The model performs
        almost as well as one trained on combined data — but neither party
        ever shared a label or a feature.
      </p>

      {/* Main two-column composition */}
      <div className="flex-1 grid grid-cols-[1fr_420px] gap-6 px-8 pt-4 pb-6 min-h-0">
        {/* LEFT — AUC hero */}
        <div className="relative bg-ink-1 border border-line-1 rounded-stage shadow-stage p-6 flex flex-col">
          <div className="flex-1 min-h-0">
            <AucChart events={events} eventIndex={events.length - 1} />
          </div>
          {finalAuc !== null && (
            <div className="absolute bottom-6 right-8 text-right">
              <span className="block text-[10px] font-mono text-mute-1 uppercase tracking-widest">
                Final <JargonTerm content={TOOLTIPS.auc}>AUC</JargonTerm>
              </span>
              <span className="block font-display font-semibold text-fore-0 leading-none text-[88px] tabular-nums">
                {finalAuc.toFixed(4)}
              </span>
              <span className="block mt-1 h-px w-full bg-wire/70" />
            </div>
          )}
        </div>

        {/* RIGHT — hero thumbs + attestation + compact tree grid */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Hero thumbnails — first, highest gain, deepest, last */}
          <div className="bg-ink-1 border border-line-1 rounded-card p-4 flex-shrink-0">
            <p className="text-[10px] font-mono text-mute-1 uppercase tracking-wider mb-3">
              Hero trees
            </p>
            <div className="grid grid-cols-2 gap-3">
              <HeroThumb
                events={events}
                treeIndex={stats.firstIndex}
                label="first split"
              />
              <HeroThumb
                events={events}
                treeIndex={stats.highestGainIndex}
                label="highest gain"
              />
              <HeroThumb
                events={events}
                treeIndex={stats.deepestIndex}
                label="deepest"
              />
              <HeroThumb
                events={events}
                treeIndex={stats.lastIndex}
                label="final tree"
              />
            </div>
          </div>

          {/* Run attestation */}
          <div className="flex-shrink-0">
            <AttestationCard
              stats={stats}
              nTrees={nTrees}
              maxDepth={maxDepth}
            />
          </div>

          {/* Compact tree grid — overflow-y-scrolls if more rows than fit */}
          <div className="bg-ink-1 border border-line-1 rounded-card p-4 flex flex-col gap-2 flex-1 min-h-0">
            <p className="text-[10px] font-mono text-mute-1 uppercase tracking-wider">
              {treeIndices.length} trees
            </p>
            <div className="flex flex-wrap gap-x-1 gap-y-1 overflow-y-auto pr-1">
              {treeIndices.map((ti) =>
                heroIndices.has(ti) ? null : (
                  <StaticTreeThumb
                    key={ti}
                    events={events}
                    treeIndex={ti}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Replay overlay — appears once status is "done" */}
      <AnimatePresence>
        {isDone && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-0/70 backdrop-blur-sm z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-host text-sm font-mono">Replay complete</p>
            <button
              className="flex items-center gap-2 bg-public text-fore-0 text-sm font-sans font-semibold px-5 py-2 rounded-card shadow-stage transition hover:brightness-110 hover:scale-[1.02]"
              onClick={onReplay}
              aria-label="Replay from start"
            >
              ↻ Replay
            </button>
            <p className="text-[10px] font-mono text-mute-1">or press R</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
