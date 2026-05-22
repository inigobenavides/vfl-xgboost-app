/**
 * useTreeState — derives the visible tree-0 structure from the event stream.
 *
 * Scans events[0..eventIndex] for tree_index===0 NodeExpandedEvents, builds
 * a recursive tree, then computes SVG positions via d3-hierarchy.tree().
 * Result is memoised; only recomputes when eventIndex changes.
 */

import { useMemo } from "react";
import { hierarchy, tree } from "d3-hierarchy";
import type { HierarchyPointNode } from "d3-hierarchy";
import type { NodeExpandedEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Node data
// ---------------------------------------------------------------------------

export interface TreeNodeData {
  id: string;
  event: NodeExpandedEvent;
  children: TreeNodeData[];
}

export type LayoutNode = HierarchyPointNode<TreeNodeData>;

// px spacing handed to d3.tree().nodeSize()
export const NODE_W = 180;
export const NODE_H = 110;
// visual dimensions of the SVG rect drawn for each node
export const BOX_W = 152;
export const BOX_H = 52;
export const LEAF_BOX_H = 44;

export interface TreeLayout {
  /** Laid-out d3 root, or null if no tree-0 nodes are visible yet. */
  root: LayoutNode | null;
  /** Left edge (in SVG coords, before margin added). */
  minX: number;
  /** Right edge. */
  maxX: number;
  /** Bottom edge (y increases downward). */
  maxY: number;
  /** Flat list of all layout nodes for iteration. */
  nodes: LayoutNode[];
  /** All parent→child pairs for edge drawing. */
  links: Array<{ source: LayoutNode; target: LayoutNode }>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTreeState(events: TraceEvent[], eventIndex: number): TreeLayout {
  return useMemo<TreeLayout>(() => {
    const EMPTY: TreeLayout = {
      root: null, minX: 0, maxX: 0, maxY: 0, nodes: [], links: [],
    };

    // Collect tree-0 node events visible so far
    const eventsById = new Map<string, NodeExpandedEvent>();
    for (let i = 0; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type === "node_expanded" && e.tree_index === 0) {
        eventsById.set(e.node_id, e);
      }
    }
    if (eventsById.size === 0) return EMPTY;

    // Build recursive structure (events arrive in BFS order so parent is
    // always added before children — the Map preserves insertion order)
    const nodeMap = new Map<string, TreeNodeData>();
    for (const [id, event] of eventsById) {
      nodeMap.set(id, { id, event, children: [] });
    }
    let rootData: TreeNodeData | null = null;
    for (const node of nodeMap.values()) {
      if (node.event.parent_id === null) {
        rootData = node;
      } else {
        const parent = nodeMap.get(node.event.parent_id);
        if (parent) parent.children.push(node);
      }
    }
    if (!rootData) return EMPTY;

    // d3 layout
    const hier = hierarchy<TreeNodeData>(rootData, (d) =>
      d.children.length > 0 ? d.children : null,
    );
    const layoutFn = tree<TreeNodeData>().nodeSize([NODE_W, NODE_H]);
    const layoutRoot = layoutFn(hier);

    // Bounds
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    const nodes: LayoutNode[] = [];
    layoutRoot.each((n) => {
      nodes.push(n);
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });

    const links: Array<{ source: LayoutNode; target: LayoutNode }> = [];
    layoutRoot.each((n) => {
      if (n.parent) links.push({ source: n.parent, target: n });
    });

    return { root: layoutRoot, minX, maxX, maxY, nodes, links };
  }, [events, eventIndex]);
}
