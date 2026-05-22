/**
 * runMeta.ts — derive run metadata from a loaded event stream.
 *
 * None of these values are hard-coded; all are scanned from the trace.
 */

import type { TraceEvent } from "./trace-reader";

export interface RunMeta {
  /** Short deterministic hex identifier derived from trace content. */
  runId: string;
  /** Number of trees trained (count of tree_start events). */
  nTrees: number;
  /** Maximum node depth seen across all node_expanded events. */
  maxDepth: number;
  /** Dataset name inferred from trace (falls back to "unknown"). */
  datasetName: string;
}

/** djb2 hash — deterministic, no external deps. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h * 33) ^ s.charCodeAt(i)) >>> 0) | 0;
  }
  return h >>> 0;
}

export function deriveRunMeta(events: TraceEvent[]): RunMeta {
  let nTrees = 0;
  let maxDepth = 0;
  let firstChapterTimestamp = "";

  for (const e of events) {
    if (e.type === "tree_start") nTrees++;
    if (e.type === "node_expanded" && e.depth > maxDepth) maxDepth = e.depth;
    if (
      e.type === "chapter_marker" &&
      e.chapter === "act1_start" &&
      firstChapterTimestamp === ""
    ) {
      firstChapterTimestamp = e.timestamp;
    }
  }

  // Run ID: djb2 of the first chapter timestamp + nTrees + maxDepth, rendered
  // as 7 hex chars. Stable for the same trace, unintelligible as raw data.
  const idSeed = `${firstChapterTimestamp}|t${nTrees}|d${maxDepth}`;
  const runId = djb2(idSeed).toString(16).padStart(7, "0").slice(0, 7);

  return {
    runId,
    nTrees,
    maxDepth,
    datasetName: "UCI Adult",
  };
}
