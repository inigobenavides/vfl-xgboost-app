/**
 * TreeView — renders the tree-0 structure as an animated SVG.
 *
 * D3 hierarchy computes positions; React/SVG owns the DOM; Framer Motion
 * handles per-node entrance animations and smooth layout reflows.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  BOX_H,
  BOX_W,
  LEAF_BOX_H,
  LEAF_BOX_W,
  NODE_H,
  NODE_W,
  useTreeState,
  type LayoutNode,
} from "./useTreeState";
import type { TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARGIN = NODE_W; // padding around the tree extents

/**
 * Auto-fit strategy (issue #31):
 *
 * We set the SVG's viewBox to cover the full natural d3 layout extent and use
 * preserveAspectRatio="xMidYMid meet" so the browser scales the whole tree
 * proportionally to fill the column width.  The SVG element spans 100 % of
 * the column width; its rendered height is proportional.  A min-height keeps
 * shallow single-node trees from collapsing to a sliver.
 *
 * Trade-off vs Option B (dynamic NODE_W) or Option C (pan-to-newest):
 *   • No ResizeObserver / JS measurement required — pure CSS/SVG attribute.
 *   • The entire tree is always visible — no clipping, no scrollbar.
 *   • At max_depth 4 the tree scales down a little; for a demo this is the
 *     right trade-off because the viewer can see all the structure at a glance.
 */
const MIN_SVG_HEIGHT = 200; // px — prevents the root-only tree from looking too cramped

// ---------------------------------------------------------------------------
// Individual node shape
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: LayoutNode;
  offsetX: number;
}

function TreeNodeShape({ node, offsetX }: TreeNodeProps) {
  const { event } = node.data;
  const x = node.x + offsetX;
  const y = node.y;
  const boxH = event.is_leaf ? LEAF_BOX_H : BOX_H;

  return (
    <motion.g
      key={node.data.id}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1, x, y }}
      exit={{ opacity: 0, scale: 0.3 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      style={{ originX: "50%", originY: "0%" }}
    >
      {/* Box — leaf nodes keep original 152 px width; internal nodes use 180 px */}
      <rect
        x={-(event.is_leaf ? LEAF_BOX_W : BOX_W) / 2}
        y={-boxH / 2}
        width={event.is_leaf ? LEAF_BOX_W : BOX_W}
        height={boxH}
        rx={6}
        className={event.is_leaf ? "fill-ink-3 stroke-line-1" : "fill-ink-3 stroke-line-2"}
        strokeWidth={1}
      />

      {event.is_leaf ? (
        <>
          {/* Leaf weight */}
          <text
            textAnchor="middle"
            y={-7}
            fontSize={11}
            className="fill-guest font-mono"
          >
            weight
          </text>
          <text
            textAnchor="middle"
            y={9}
            fontSize={13}
            fontWeight={600}
            className="fill-fore-2"
          >
            {event.leaf_weight !== null ? event.leaf_weight.toFixed(4) : "—"}
          </text>
          {/* Sample count */}
          <text textAnchor="middle" y={24} fontSize={10} className="fill-mute-2">
            {event.n_samples} samples
          </text>
        </>
      ) : (
        <>
          {/* Feature : threshold */}
          <text
            textAnchor="middle"
            y={-10}
            fontSize={12}
            fontWeight={600}
            className="fill-host"
          >
            {event.feature_id ?? "?"} : bin {event.threshold_bin ?? "?"}
          </text>
          {/* Gain */}
          <text
            textAnchor="middle"
            y={5}
            fontSize={11}
            className="fill-public"
          >
            gain {event.gain !== null ? event.gain.toFixed(3) : "—"}
          </text>
          {/* Sample count */}
          <text textAnchor="middle" y={19} fontSize={10} className="fill-mute-2">
            {event.n_samples} samples
          </text>
        </>
      )}
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Edge with sample counts
// ---------------------------------------------------------------------------

interface EdgeProps {
  source: LayoutNode;
  target: LayoutNode;
  offsetX: number;
  isLeft: boolean;
}

function Edge({ source, target, offsetX, isLeft }: EdgeProps) {
  const sx = source.x + offsetX;
  const sy = source.y + (source.data.event.is_leaf ? LEAF_BOX_H : BOX_H) / 2;
  const tx = target.x + offsetX;
  const ty = target.y - (target.data.event.is_leaf ? LEAF_BOX_H : BOX_H) / 2;

  // Midpoint for edge label
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  // Sample count to show: parent's samples_l for left child, samples_r for right
  const sampleCount = isLeft
    ? source.data.event.samples_l
    : source.data.event.samples_r;

  return (
    <motion.g
      key={`edge-${target.data.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <line
        x1={sx}
        y1={sy}
        x2={tx}
        y2={ty}
        stroke="var(--color-line-2)"
        strokeWidth={1.5}
      />
      {sampleCount > 0 && (
        <text
          x={mx}
          y={my - 4}
          textAnchor="middle"
          fontSize={9}
          fill="var(--color-mute-1)"
        >
          {sampleCount}
        </text>
      )}
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TreeViewProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function TreeView({ events, eventIndex }: TreeViewProps) {
  const layout = useTreeState(events, eventIndex);

  if (!layout.root) {
    // Empty state: App provides its own scaffold (ghost tree + "awaiting first
    // split"). Standalone TreeView stories see an empty box at the same height
    // the real tree would occupy.
    return <div className="h-48" aria-hidden="true" />;
  }

  const { nodes, links, minX, maxX, minY, maxY } = layout;

  // The top-most node centre sits at minY (0 for root).  Its box extends
  // BOX_H/2 above that centre, so we need an extra top-margin of at least
  // BOX_H/2 + a small visual gap to avoid clipping.
  const TOP_PAD = BOX_H / 2 + 8;
  const viewBoxTop = minY - TOP_PAD;

  const offsetX = -minX + MARGIN;
  const svgW = maxX - minX + MARGIN * 2;
  const svgH = maxY - minY + NODE_H + MARGIN / 2 + TOP_PAD;

  return (
    <div className="w-full">
      <svg
        width="100%"
        height={Math.max(svgH, MIN_SVG_HEIGHT)}
        viewBox={`0 ${viewBoxTop} ${svgW} ${svgH}`}
        preserveAspectRatio="xMidYMid meet"
        className="font-mono"
      >
        {/* Edges (rendered first so they appear behind nodes) */}
        <AnimatePresence>
          {links.map(({ source, target }) => {
            const isLeft =
              source.children !== null &&
              source.children !== undefined &&
              source.children[0]?.data.id === target.data.id;
            return (
              <Edge
                key={`edge-${target.data.id}`}
                source={source}
                target={target}
                offsetX={offsetX}
                isLeft={isLeft}
              />
            );
          })}
        </AnimatePresence>

        {/* Nodes */}
        <AnimatePresence>
          {nodes.map((node) => (
            <TreeNodeShape
              key={node.data.id}
              node={node}
              offsetX={offsetX}
            />
          ))}
        </AnimatePresence>
      </svg>
    </div>
  );
}
