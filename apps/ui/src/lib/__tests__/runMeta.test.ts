import { describe, it, expect } from "vitest";
import { deriveRunMeta } from "../runMeta";
import type { TraceEvent } from "../trace-reader";

const ts = "2026-01-01T00:00:00.000001Z";

function makeTrace(): TraceEvent[] {
  return [
    { type: "chapter_marker", chapter: "act1_start", timestamp: ts },
    { type: "tree_start", tree_index: 0, n_samples: 100, timestamp: ts },
    {
      type: "node_expanded", tree_index: 0, node_id: "t0/n0", parent_id: null,
      depth: 0, n_samples: 100, samples_l: 60, samples_r: 40,
      feature_id: "age", threshold_bin: 3, gain: 1.2, leaf_weight: null,
      is_leaf: false, timestamp: ts,
    },
    {
      type: "node_expanded", tree_index: 0, node_id: "t0/n1", parent_id: "t0/n0",
      depth: 3, n_samples: 60, samples_l: 0, samples_r: 0,
      feature_id: null, threshold_bin: null, gain: null, leaf_weight: -0.5,
      is_leaf: true, timestamp: ts,
    },
    { type: "tree_start", tree_index: 1, n_samples: 100, timestamp: ts },
    { type: "chapter_marker", chapter: "final", timestamp: ts },
  ];
}

describe("deriveRunMeta", () => {
  it("counts trees from tree_start events", () => {
    const meta = deriveRunMeta(makeTrace());
    expect(meta.nTrees).toBe(2);
  });

  it("finds max depth from node_expanded events", () => {
    const meta = deriveRunMeta(makeTrace());
    expect(meta.maxDepth).toBe(3);
  });

  it("sets datasetName to UCI Adult", () => {
    expect(deriveRunMeta(makeTrace()).datasetName).toBe("UCI Adult");
  });

  it("generates a stable run ID (same trace → same ID)", () => {
    const id1 = deriveRunMeta(makeTrace()).runId;
    const id2 = deriveRunMeta(makeTrace()).runId;
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(7);
  });

  it("different traces produce different run IDs", () => {
    const trace2 = makeTrace();
    // Change the act1_start timestamp to get a different ID
    const ch = trace2[0];
    if (ch.type === "chapter_marker") {
      trace2[0] = { ...ch, timestamp: "2026-06-01T00:00:00Z" };
    }
    expect(deriveRunMeta(makeTrace()).runId).not.toBe(deriveRunMeta(trace2).runId);
  });

  it("handles empty trace gracefully", () => {
    const meta = deriveRunMeta([]);
    expect(meta.nTrees).toBe(0);
    expect(meta.maxDepth).toBe(0);
  });
});
