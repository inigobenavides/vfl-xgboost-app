/**
 * Filmstrip — horizontal strip of tree thumbnails accumulating in sync with TreeStartEvents.
 *
 * Each thumbnail is a miniaturised SVG tree (topology preserved, no labels).
 * A flash animation fires when a new thumbnail lands. Tree 0 enters with a
 * slight scale-up to mark the "camera pull-back" from the full tree view.
 */

import { AnimatePresence, motion } from "framer-motion";
import { hierarchy, tree } from "d3-hierarchy";
import { useEffect, useMemo, useRef } from "react";
import type { NodeExpandedEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THUMB_W = 52;
const THUMB_H = 38;
const THUMB_MARGIN = 4;

// ---------------------------------------------------------------------------
// Compact tree layout utility
// ---------------------------------------------------------------------------

interface ThumbLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface ThumbNode {
  x: number;
  y: number;
  isLeaf: boolean;
}
interface ThumbLayout {
  nodes: ThumbNode[];
  links: ThumbLink[];
}

function buildThumbLayout(events: TraceEvent[], treeIndex: number): ThumbLayout | null {
  type N = { id: string; ev: NodeExpandedEvent; ch: N[] };

  const nodesMap = new Map<string, NodeExpandedEvent>();
  for (const e of events) {
    if (e.type === "node_expanded" && e.tree_index === treeIndex) {
      nodesMap.set(e.node_id, e);
    }
  }
  if (nodesMap.size === 0) return null;

  const nm = new Map<string, N>();
  for (const [id, ev] of nodesMap) nm.set(id, { id, ev, ch: [] });
  let root: N | null = null;
  for (const n of nm.values()) {
    if (n.ev.parent_id === null) root = n;
    else nm.get(n.ev.parent_id)?.ch.push(n);
  }
  if (!root) return null;

  const hier = hierarchy<N>(root, (d) => (d.ch.length > 0 ? d.ch : null));
  const laid = tree<N>().nodeSize([8, 12])(hier);

  let minX = Infinity, maxX = -Infinity, maxY = 0;
  const rawNodes: Array<{ x: number; y: number; isLeaf: boolean }> = [];
  laid.each((n) => {
    rawNodes.push({ x: n.x, y: n.y, isLeaf: n.data.ev.is_leaf });
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  });

  const usableW = THUMB_W - 2 * THUMB_MARGIN;
  const usableH = THUMB_H - 2 * THUMB_MARGIN;
  const scaleX = usableW / ((maxX - minX) || 1);
  const scaleY = usableH / (maxY || 1);

  const nodes: ThumbNode[] = rawNodes.map((n) => ({
    x: (n.x - minX) * scaleX + THUMB_MARGIN,
    y: n.y * scaleY + THUMB_MARGIN,
    isLeaf: n.isLeaf,
  }));

  const links: ThumbLink[] = [];
  laid.each((n) => {
    if (n.parent) {
      links.push({
        x1: (n.parent.x - minX) * scaleX + THUMB_MARGIN,
        y1: n.parent.y * scaleY + THUMB_MARGIN,
        x2: (n.x - minX) * scaleX + THUMB_MARGIN,
        y2: n.y * scaleY + THUMB_MARGIN,
      });
    }
  });

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// TreeThumb — compact SVG rendering of one tree
// ---------------------------------------------------------------------------

interface TreeThumbProps {
  events: TraceEvent[];
  treeIndex: number;
  isFirst: boolean;
}

function TreeThumb({ events, treeIndex, isFirst }: TreeThumbProps) {
  const layout = useMemo(
    () => buildThumbLayout(events, treeIndex),
    [events, treeIndex],
  );

  return (
    <motion.div
      className="relative overflow-hidden rounded border border-gray-700 bg-gray-900 flex-shrink-0"
      style={{ width: THUMB_W, height: THUMB_H }}
      initial={{ opacity: 0, scale: 0.7, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: isFirst ? 180 : 300,
        damping: isFirst ? 22 : 28,
      }}
    >
      {/* Flash overlay — fades away after mount */}
      <motion.div
        className="absolute inset-0 bg-wire/20 pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      />
      {layout ? (
        <svg width={THUMB_W} height={THUMB_H}>
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
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[8px] text-gray-700">{treeIndex}</span>
        </div>
      )}
      <span className="absolute bottom-0 right-0.5 text-[7px] text-gray-700 leading-none pb-0.5">
        {treeIndex}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Filmstrip
// ---------------------------------------------------------------------------

interface FilmstripProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function Filmstrip({ events, eventIndex }: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleTrees = useMemo(() => {
    const trees: number[] = [];
    for (let i = 0; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type === "tree_start") trees.push(e.tree_index);
    }
    return trees;
  }, [events, eventIndex]);

  // Auto-scroll to reveal the latest thumbnail
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [visibleTrees.length]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">
          Trees
        </p>
        <span className="text-[10px] font-mono text-gray-500 tabular-nums">
          {visibleTrees.length} / 100
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto pb-1"
        style={{ scrollBehavior: "smooth" }}
      >
        <AnimatePresence>
          {visibleTrees.map((treeIndex) => (
            <TreeThumb
              key={treeIndex}
              events={events}
              treeIndex={treeIndex}
              isFirst={treeIndex === 0}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
