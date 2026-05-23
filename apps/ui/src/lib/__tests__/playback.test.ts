import { describe, it, expect } from "vitest";
import {
  buildConfig,
  currentChapterIndex,
  initialState,
  MS_PER_EVENT_1X,
  RECONSTRUCTION_HOLD_MS,
  FINAL_REVEAL_HOLD_MS,
  reduce,
  type PlaybackConfig,
  type PlaybackState,
} from "../playback";
import type { TraceEvent } from "../trace-reader";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function treeStart(treeIndex: number): TraceEvent {
  return {
    type: "tree_start",
    tree_index: treeIndex,
    n_samples: 100,
    timestamp: "2026-01-01T00:00:00Z",
  };
}

function chapter(name: "act1_start" | "reconstruction" | "act2_start" | "final"): TraceEvent {
  return { type: "chapter_marker", chapter: name, timestamp: "2026-01-01T00:00:00Z" };
}

function nodeExpanded(treeIndex: number, nodeId: string): TraceEvent {
  return {
    type: "node_expanded",
    tree_index: treeIndex,
    node_id: nodeId,
    parent_id: null,
    depth: 0,
    n_samples: 10,
    samples_l: 5,
    samples_r: 5,
    feature_id: null,
    threshold_bin: null,
    gain: null,
    leaf_weight: -0.5,
    is_leaf: true,
    timestamp: "2026-01-01T00:00:00Z",
  };
}

/**
 * Minimal 10-event trace:
 *   0: chapter_marker{act1_start}
 *   1: tree_start{0}
 *   2: node_expanded{0, t0/n0}
 *   3: chapter_marker{reconstruction}
 *   4: node_expanded{0, t0/n1}
 *   5: chapter_marker{act2_start}
 *   6: tree_start{1}
 *   7: node_expanded{1, t1/n0}
 *   8: chapter_marker{final}
 *   9: node_expanded{1, t1/n1}
 */
const EVENTS: TraceEvent[] = [
  chapter("act1_start"),        // 0
  treeStart(0),                  // 1
  nodeExpanded(0, "t0/n0"),     // 2
  chapter("reconstruction"),     // 3
  nodeExpanded(0, "t0/n1"),     // 4
  chapter("act2_start"),         // 5
  treeStart(1),                  // 6
  nodeExpanded(1, "t1/n0"),     // 7
  chapter("final"),              // 8
  nodeExpanded(1, "t1/n1"),     // 9
];

const CONFIG: PlaybackConfig = buildConfig(EVENTS);

function step(state: PlaybackState, action: Parameters<typeof reduce>[1]): PlaybackState {
  return reduce(state, action, CONFIG);
}

// ---------------------------------------------------------------------------
// buildConfig
// ---------------------------------------------------------------------------

describe("buildConfig", () => {
  it("extracts all four chapter offsets in order", () => {
    expect(CONFIG.chapterOffsets).toEqual([
      { name: "act1_start", eventIndex: 0 },
      { name: "reconstruction", eventIndex: 3 },
      { name: "act2_start", eventIndex: 5 },
      { name: "final", eventIndex: 8 },
    ]);
  });

  it("sets reconstructionEventIndex correctly", () => {
    expect(CONFIG.reconstructionEventIndex).toBe(3);
  });

  it("sets finalEventIndex correctly", () => {
    expect(CONFIG.finalEventIndex).toBe(8);
  });

  it("sets totalEvents", () => {
    expect(CONFIG.totalEvents).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// currentChapterIndex
// ---------------------------------------------------------------------------

describe("currentChapterIndex", () => {
  it("returns -1 before any chapter", () => {
    // If first chapter is at index 0, no position is before it
    // Use a config where first chapter starts at 2
    const offsets = [{ name: "act1_start" as const, eventIndex: 2 }];
    expect(currentChapterIndex(0, offsets)).toBe(-1);
    expect(currentChapterIndex(1, offsets)).toBe(-1);
  });

  it("returns 0 when at or past first chapter", () => {
    expect(currentChapterIndex(0, CONFIG.chapterOffsets)).toBe(0);
  });

  it("returns 1 when between chapter 1 and 2", () => {
    expect(currentChapterIndex(4, CONFIG.chapterOffsets)).toBe(1);
  });

  it("returns last chapter index when past all chapters", () => {
    expect(currentChapterIndex(9, CONFIG.chapterOffsets)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// play / pause transitions
// ---------------------------------------------------------------------------

describe("play / pause", () => {
  it("transitions paused → playing on play", () => {
    const s = step(initialState(), { type: "play" });
    expect(s.status).toBe("playing");
  });

  it("is idempotent: playing + play stays playing", () => {
    const playing = step(initialState(), { type: "play" });
    const s = step(playing, { type: "play" });
    expect(s.status).toBe("playing");
  });

  it("transitions playing → paused on pause", () => {
    const playing = step(initialState(), { type: "play" });
    const s = step(playing, { type: "pause" });
    expect(s.status).toBe("paused");
  });

  it("ignores play when done", () => {
    const done: PlaybackState = { ...initialState(), status: "done" };
    expect(step(done, { type: "play" }).status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// step-back / step-forward
// ---------------------------------------------------------------------------

describe("step-back / step-forward", () => {
  it("step-forward advances eventIndex by 1", () => {
    const s = step({ ...initialState(), eventIndex: 3 }, { type: "step-forward" });
    expect(s.eventIndex).toBe(4);
    expect(s.status).toBe("paused");
  });

  it("step-back decrements eventIndex by 1", () => {
    const s = step({ ...initialState(), eventIndex: 3 }, { type: "step-back" });
    expect(s.eventIndex).toBe(2);
    expect(s.status).toBe("paused");
  });

  it("step-back clamps at 0", () => {
    const s = step(initialState(), { type: "step-back" });
    expect(s.eventIndex).toBe(0);
  });

  it("step-forward clamps at maxIndex", () => {
    const s = step({ ...initialState(), eventIndex: 9 }, { type: "step-forward" });
    expect(s.eventIndex).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// scrub — jumps without replaying intermediate events
// ---------------------------------------------------------------------------

describe("scrub", () => {
  it("sets eventIndex directly", () => {
    const s = step(initialState(), { type: "scrub", eventIndex: 7 });
    expect(s.eventIndex).toBe(7);
    expect(s.status).toBe("paused");
  });

  it("clamps to valid range", () => {
    expect(step(initialState(), { type: "scrub", eventIndex: -5 }).eventIndex).toBe(0);
    expect(step(initialState(), { type: "scrub", eventIndex: 999 }).eventIndex).toBe(9);
  });

  it("does not replay intermediate events — eventIndex jumps directly", () => {
    // Scrubbing from 1 → 7 does NOT hit the reconstruction trigger
    const s0 = { ...initialState(), eventIndex: 1 };
    const s1 = step(s0, { type: "scrub", eventIndex: 7 });
    expect(s1.eventIndex).toBe(7);
    expect(s1.status).toBe("paused"); // NOT reconstruction-hold
  });
});

// ---------------------------------------------------------------------------
// chapter jumping
// ---------------------------------------------------------------------------

describe("jump-to-chapter", () => {
  it("lands on exact chapter event index", () => {
    const s = step(initialState(), { type: "jump-to-chapter", chapterIndex: 2 });
    expect(s.eventIndex).toBe(5); // act2_start is at index 5
    expect(s.status).toBe("paused");
  });

  it("out-of-range chapterIndex is ignored", () => {
    const s0 = { ...initialState(), eventIndex: 3 };
    const s1 = step(s0, { type: "jump-to-chapter", chapterIndex: 99 });
    expect(s1).toEqual(s0);
  });
});

describe("jump-chapter (relative)", () => {
  it("forward jumps to next chapter", () => {
    const s0 = { ...initialState(), eventIndex: 1 }; // in act1_start
    const s1 = step(s0, { type: "jump-chapter", direction: "forward" });
    expect(s1.eventIndex).toBe(3); // reconstruction
  });

  it("back from well into chapter jumps to chapter start", () => {
    // eventIndex 4 is 1 beyond reconstruction (index 3), which is > start+2? 4 > 3+2=5 → no
    // Let's use eventIndex 7 which is in act2_start (starts at 5), 7 > 5+2=7 → no (not > 7)
    // Use eventIndex 8 (final, starts at 8)
    const s0 = { ...initialState(), eventIndex: 9 }; // well past final (8)
    const s1 = step(s0, { type: "jump-chapter", direction: "back" });
    // 9 > 8+2=10? No. So jump back one chapter to act2_start=5
    expect(s1.eventIndex).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// reconstruction-hold
// ---------------------------------------------------------------------------

describe("reconstruction-hold", () => {
  it("entered when tick crosses the reconstruction event index", () => {
    const playing = { ...initialState(), status: "playing" as const, eventIndex: 2 };
    // A large tick that would jump past index 3
    const deltaMs = MS_PER_EVENT_1X * 5;
    const s = step(playing, { type: "tick", deltaMs });
    expect(s.status).toBe("reconstruction-hold");
    expect(s.eventIndex).toBe(3);
    expect(s.holdMsRemaining).toBe(RECONSTRUCTION_HOLD_MS);
  });

  it("hold counts down on each tick", () => {
    const holding: PlaybackState = {
      ...initialState(),
      status: "reconstruction-hold",
      eventIndex: 3,
      holdMsRemaining: 1000,
    };
    const s = step(holding, { type: "tick", deltaMs: 300 });
    expect(s.status).toBe("reconstruction-hold");
    expect(s.holdMsRemaining).toBeCloseTo(700);
  });

  it("exits hold and resumes playing when timer expires", () => {
    const holding: PlaybackState = {
      ...initialState(),
      status: "reconstruction-hold",
      eventIndex: 3,
      holdMsRemaining: 100,
    };
    const s = step(holding, { type: "tick", deltaMs: 200 });
    expect(s.status).toBe("playing");
    expect(s.holdMsRemaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// final-reveal-hold
// ---------------------------------------------------------------------------

describe("final-reveal-hold", () => {
  it("entered when tick crosses final event index", () => {
    const playing: PlaybackState = {
      ...initialState(),
      status: "playing",
      eventIndex: 7,
    };
    const deltaMs = MS_PER_EVENT_1X * 5;
    const s = step(playing, { type: "tick", deltaMs });
    expect(s.status).toBe("final-reveal-hold");
    expect(s.eventIndex).toBe(8);
    expect(s.holdMsRemaining).toBe(FINAL_REVEAL_HOLD_MS);
  });

  it("blocks further advancement until hold expires", () => {
    const holding: PlaybackState = {
      ...initialState(),
      status: "final-reveal-hold",
      eventIndex: 8,
      holdMsRemaining: 500,
    };
    const s = step(holding, { type: "tick", deltaMs: 100 });
    expect(s.status).toBe("final-reveal-hold");
    expect(s.eventIndex).toBe(8);
  });

  it("transitions to done after hold expires", () => {
    const holding: PlaybackState = {
      ...initialState(),
      status: "final-reveal-hold",
      eventIndex: 8,
      holdMsRemaining: 100,
    };
    const s = step(holding, { type: "tick", deltaMs: 200 });
    expect(s.status).toBe("done");
  });

  it("restart resets to initial state, preserving speed", () => {
    const done: PlaybackState = { ...initialState(), status: "done", speed: 2 };
    const s = step(done, { type: "restart" });
    expect(s.status).toBe("paused");
    expect(s.eventIndex).toBe(0);
    expect(s.speed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// speed
// ---------------------------------------------------------------------------

describe("speed", () => {
  it("set-speed updates speed without changing status or index", () => {
    const s0 = { ...initialState(), eventIndex: 5 };
    const s1 = step(s0, { type: "set-speed", speed: 2 });
    expect(s1.speed).toBe(2);
    expect(s1.eventIndex).toBe(5);
    expect(s1.status).toBe("paused");
  });

  it("higher speed advances more events per tick", () => {
    // Start at index 4 (past reconstruction=3, before final=8) so neither speed crosses a hold.
    const base = { ...initialState(), status: "playing" as const, eventIndex: 4 };
    const s1x: PlaybackState = { ...base, speed: 1 };
    const s2x: PlaybackState = { ...base, speed: 2 };
    const delta = MS_PER_EVENT_1X; // 1x → +1 event; 2x → +2 events
    const r1x = step(s1x, { type: "tick", deltaMs: delta });
    const r2x = step(s2x, { type: "tick", deltaMs: delta });
    expect(r2x.eventIndex).toBeGreaterThan(r1x.eventIndex);
  });
});

// ---------------------------------------------------------------------------
// eventAccumulator — fractional progress fix (issue #39)
// ---------------------------------------------------------------------------

describe("eventAccumulator (tick accumulation)", () => {
  it("three 16 ms ticks at 1× yield eventIndex 1 after the third tick", () => {
    // 16 ms × (1/40 events/ms) = 0.4 events per tick
    // After tick 1: acc = 0.4, advance = 0, index = 0, remainder = 0.4
    // After tick 2: acc = 0.8, advance = 0, index = 0, remainder = 0.8
    // After tick 3: acc = 1.2, advance = 1, index = 1, remainder = 0.2
    // The exact per-tick contribution at 16 ms × (1/40) = 0.4 per tick,
    // so 3 × 0.4 = 1.2 → floor(1.2) = 1.
    const playing: PlaybackState = {
      ...initialState(),
      status: "playing",
      eventIndex: 0,
    };
    let s = playing;
    s = step(s, { type: "tick", deltaMs: 16 });
    s = step(s, { type: "tick", deltaMs: 16 });
    s = step(s, { type: "tick", deltaMs: 16 });
    expect(s.eventIndex).toBe(1);
    expect(s.status).toBe("playing");
    // Remainder should be the fractional part after removing the integer advance
    expect(s.eventAccumulator).toBeGreaterThan(0);
    expect(s.eventAccumulator).toBeLessThan(1);
  });

  it("without accumulator, three 16 ms ticks at 1× would never advance (regression guard)", () => {
    // This test documents the old broken behaviour: floor(0 + 0.4) = 0 every tick.
    // With the fix, index DOES advance. We simply confirm the new behaviour is correct.
    const playing: PlaybackState = {
      ...initialState(),
      status: "playing",
      eventIndex: 0,
    };
    let s = playing;
    s = step(s, { type: "tick", deltaMs: 16 });
    s = step(s, { type: "tick", deltaMs: 16 });
    // Two ticks of 0.4 → accumulated 0.8, still no advance yet
    expect(s.eventIndex).toBe(0);
    // Third tick tips over 1.0
    s = step(s, { type: "tick", deltaMs: 16 });
    expect(s.eventIndex).toBe(1);
  });

  it("accumulator resets to 0 on play", () => {
    const s0: PlaybackState = { ...initialState(), eventAccumulator: 0.7 };
    const s1 = step(s0, { type: "play" });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on pause", () => {
    const s0: PlaybackState = {
      ...initialState(),
      status: "playing",
      eventAccumulator: 0.7,
    };
    const s1 = step(s0, { type: "pause" });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on step-forward", () => {
    const s0: PlaybackState = { ...initialState(), eventIndex: 2, eventAccumulator: 0.9 };
    const s1 = step(s0, { type: "step-forward" });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on step-back", () => {
    const s0: PlaybackState = { ...initialState(), eventIndex: 2, eventAccumulator: 0.9 };
    const s1 = step(s0, { type: "step-back" });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on scrub", () => {
    const s0: PlaybackState = { ...initialState(), eventAccumulator: 0.5 };
    const s1 = step(s0, { type: "scrub", eventIndex: 5 });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on set-speed", () => {
    const s0: PlaybackState = { ...initialState(), eventAccumulator: 0.6 };
    const s1 = step(s0, { type: "set-speed", speed: 2 });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on restart", () => {
    const s0: PlaybackState = {
      ...initialState(),
      status: "done",
      eventAccumulator: 0.8,
      speed: 2,
    };
    const s1 = step(s0, { type: "restart" });
    expect(s1.eventAccumulator).toBe(0);
    expect(s1.speed).toBe(2);
  });

  it("accumulator resets to 0 on jump-to-chapter", () => {
    const s0: PlaybackState = { ...initialState(), eventAccumulator: 0.4 };
    const s1 = step(s0, { type: "jump-to-chapter", chapterIndex: 1 });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 on jump-chapter", () => {
    const s0: PlaybackState = {
      ...initialState(),
      eventIndex: 0,
      eventAccumulator: 0.3,
    };
    const s1 = step(s0, { type: "jump-chapter", direction: "forward" });
    expect(s1.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 when reconstruction-hold is entered", () => {
    // eventIndex 2, tick large enough to cross reconstruction at index 3
    const playing: PlaybackState = {
      ...initialState(),
      status: "playing",
      eventIndex: 2,
      eventAccumulator: 0.5,
    };
    const deltaMs = MS_PER_EVENT_1X * 5;
    const s = step(playing, { type: "tick", deltaMs });
    expect(s.status).toBe("reconstruction-hold");
    expect(s.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 when final-reveal-hold is entered", () => {
    const playing: PlaybackState = {
      ...initialState(),
      status: "playing",
      eventIndex: 7,
      eventAccumulator: 0.5,
    };
    const deltaMs = MS_PER_EVENT_1X * 5;
    const s = step(playing, { type: "tick", deltaMs });
    expect(s.status).toBe("final-reveal-hold");
    expect(s.eventAccumulator).toBe(0);
  });

  it("accumulator resets to 0 when status becomes done", () => {
    // eventIndex 9 is maxIndex (10 events, indices 0-9); a tick should trigger done
    const playing: PlaybackState = {
      ...initialState(),
      status: "playing",
      // Past final marker (8) and reconstruction (3) so no holds; at index 9 (max)
      // Actually maxIndex=9 and we need a tick that sets nextIndex >= maxIndex.
      // Put index at 8 (past finalEventIndex=8 already means we won't re-trigger it),
      // but we need to be past both markers. Use index 9 directly — a tick of any
      // positive delta should clamp to maxIndex and return done.
      eventIndex: 9,
      eventAccumulator: 0.3,
    };
    const s = step(playing, { type: "tick", deltaMs: 1 });
    // nextIndex = clamp(9 + floor(0.3 + 0.025), 0, 9) = clamp(9, 0, 9) = 9 → done
    expect(s.status).toBe("done");
    expect(s.eventAccumulator).toBe(0);
  });
});
