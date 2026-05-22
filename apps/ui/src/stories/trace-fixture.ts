/**
 * trace-fixture.ts — shared trace data for Storybook stories.
 *
 * Imports the canonical JSONL trace via Vite's ?raw suffix and slices it
 * into convenient event-index checkpoints for story rendering states.
 */

import traceRaw from "../../traces/uci-adult-canonical.jsonl?raw";
import { parseTrace } from "../lib/trace-reader";

export const ALL_EVENTS = parseTrace(traceRaw);

/** Find index of a chapter_marker event. Returns -1 if not found. */
function chapterIndex(chapter: string): number {
  return ALL_EVENTS.findIndex(
    (e) => e.type === "chapter_marker" && e.chapter === chapter,
  );
}

export const RECONSTRUCTION_IDX = chapterIndex("reconstruction");
export const ACT2_START_IDX = chapterIndex("act2_start");
export const FINAL_IDX = chapterIndex("final");

/** Index after which tree-0 is fully expanded (just before reconstruction). */
export const TREE0_DONE_IDX = RECONSTRUCTION_IDX > 0 ? RECONSTRUCTION_IDX - 1 : 50;

/** A handful of events visible mid-tree-0 (around half the node_expanded events). */
export const MID_TREE0_IDX = Math.floor(RECONSTRUCTION_IDX / 2);

/** One tree (tree 1) has started in act 2. */
export const ACT2_ONE_TREE_IDX =
  ACT2_START_IDX > 0
    ? ALL_EVENTS.findIndex(
        (e, i) => i > ACT2_START_IDX && e.type === "auc_delta",
      )
    : ACT2_START_IDX + 5;

/** All events (final state). */
export const FULL_IDX = ALL_EVENTS.length - 1;
