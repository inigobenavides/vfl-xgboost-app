/**
 * playback.ts — pure, framework-free playback state machine.
 *
 * No React, no DOM, no side-effects. Inputs and outputs are plain TS values.
 * Tests import this module directly without any React test harness.
 */

import type { ChapterName, TraceEvent } from "./trace-reader";

// ---------------------------------------------------------------------------
// Configuration — derived once from the loaded event array
// ---------------------------------------------------------------------------

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** Real milliseconds per event at 1× speed. 40 ms/event → ~2 min for 3k-event trace. */
export const MS_PER_EVENT_1X = 40;

/** Milliseconds the player holds at the reconstruction beat before resuming. */
export const RECONSTRUCTION_HOLD_MS = 2000;

/** Milliseconds the player holds at the final-reveal frame before transitioning to done. */
export const FINAL_REVEAL_HOLD_MS = 2000;

export interface ChapterOffset {
  name: ChapterName;
  eventIndex: number;
}

export interface PlaybackConfig {
  totalEvents: number;
  chapterOffsets: ChapterOffset[];
  /** Event index of the `chapter_marker{reconstruction}` event, or -1 if absent. */
  reconstructionEventIndex: number;
  /** Event index of the `chapter_marker{final}` event, or -1 if absent. */
  finalEventIndex: number;
}

/** Build a PlaybackConfig from a loaded event array. O(n). */
export function buildConfig(events: TraceEvent[]): PlaybackConfig {
  const chapterOffsets: ChapterOffset[] = [];
  let reconstructionEventIndex = -1;
  let finalEventIndex = -1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "chapter_marker") {
      chapterOffsets.push({ name: e.chapter, eventIndex: i });
      if (e.chapter === "reconstruction") reconstructionEventIndex = i;
      if (e.chapter === "final") finalEventIndex = i;
    }
  }

  return {
    totalEvents: events.length,
    chapterOffsets,
    reconstructionEventIndex,
    finalEventIndex,
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type PlaybackStatus =
  | "paused"
  | "playing"
  | "reconstruction-hold"
  | "final-reveal-hold"
  | "done";

export interface PlaybackState {
  status: PlaybackStatus;
  /** Integer index into the events array. */
  eventIndex: number;
  speed: Speed;
  /** Remaining hold duration in ms — only meaningful during *-hold statuses. */
  holdMsRemaining: number;
}

export function initialState(): PlaybackState {
  return { status: "paused", eventIndex: 0, speed: 1, holdMsRemaining: 0 };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type PlaybackAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "step-back" }
  | { type: "step-forward" }
  | { type: "scrub"; eventIndex: number }
  | { type: "jump-chapter"; direction: "back" | "forward" }
  | { type: "jump-to-chapter"; chapterIndex: number }
  | { type: "set-speed"; speed: Speed }
  | { type: "tick"; deltaMs: number }
  | { type: "restart" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Index (0-based) of the last chapter whose event index ≤ current position, or -1. */
export function currentChapterIndex(
  eventIndex: number,
  chapterOffsets: ChapterOffset[],
): number {
  let ci = -1;
  for (let i = 0; i < chapterOffsets.length; i++) {
    if (chapterOffsets[i].eventIndex <= eventIndex) ci = i;
  }
  return ci;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(
  state: PlaybackState,
  action: PlaybackAction,
  config: PlaybackConfig,
): PlaybackState {
  const { totalEvents, chapterOffsets, reconstructionEventIndex, finalEventIndex } =
    config;
  const maxIndex = totalEvents - 1;

  switch (action.type) {
    case "play": {
      if (state.status === "done" || state.status === "playing") return state;
      return { ...state, status: "playing" };
    }

    case "pause": {
      if (state.status === "playing") return { ...state, status: "paused" };
      if (state.status === "reconstruction-hold")
        return { ...state, status: "paused", holdMsRemaining: 0 };
      return state;
    }

    case "step-back": {
      return {
        ...state,
        status: "paused",
        eventIndex: clamp(state.eventIndex - 1, 0, maxIndex),
        holdMsRemaining: 0,
      };
    }

    case "step-forward": {
      return {
        ...state,
        status: "paused",
        eventIndex: clamp(state.eventIndex + 1, 0, maxIndex),
        holdMsRemaining: 0,
      };
    }

    case "scrub": {
      return {
        ...state,
        status: "paused",
        eventIndex: clamp(action.eventIndex, 0, maxIndex),
        holdMsRemaining: 0,
      };
    }

    case "jump-chapter": {
      const ci = currentChapterIndex(state.eventIndex, chapterOffsets);
      let targetCi: number;

      if (action.direction === "forward") {
        targetCi = clamp(ci + 1, 0, chapterOffsets.length - 1);
      } else {
        // If already near the start of the current chapter, jump one further back.
        const currentStart = ci >= 0 ? chapterOffsets[ci].eventIndex : 0;
        if (state.eventIndex > currentStart + 2 && ci >= 0) {
          targetCi = ci;
        } else {
          targetCi = clamp(ci - 1, 0, chapterOffsets.length - 1);
        }
      }

      if (targetCi < 0 || targetCi >= chapterOffsets.length) return state;
      return {
        ...state,
        status: "paused",
        eventIndex: chapterOffsets[targetCi].eventIndex,
        holdMsRemaining: 0,
      };
    }

    case "jump-to-chapter": {
      const { chapterIndex } = action;
      if (chapterIndex < 0 || chapterIndex >= chapterOffsets.length) return state;
      return {
        ...state,
        status: "paused",
        eventIndex: chapterOffsets[chapterIndex].eventIndex,
        holdMsRemaining: 0,
      };
    }

    case "set-speed": {
      return { ...state, speed: action.speed };
    }

    case "restart": {
      return { ...initialState(), speed: state.speed };
    }

    case "tick": {
      if (state.status === "reconstruction-hold") {
        const remaining = state.holdMsRemaining - action.deltaMs;
        if (remaining <= 0) return { ...state, status: "playing", holdMsRemaining: 0 };
        return { ...state, holdMsRemaining: remaining };
      }

      if (state.status === "final-reveal-hold") {
        const remaining = state.holdMsRemaining - action.deltaMs;
        if (remaining <= 0) return { ...state, status: "done", holdMsRemaining: 0 };
        return { ...state, holdMsRemaining: remaining };
      }

      if (state.status !== "playing") return state;

      const eventsPerMs = state.speed / MS_PER_EVENT_1X;
      const nextIndex = clamp(
        Math.floor(state.eventIndex + action.deltaMs * eventsPerMs),
        0,
        maxIndex,
      );

      // Check hold triggers — did we cross a special marker?
      if (
        reconstructionEventIndex >= 0 &&
        state.eventIndex < reconstructionEventIndex &&
        nextIndex >= reconstructionEventIndex
      ) {
        return {
          ...state,
          status: "reconstruction-hold",
          eventIndex: reconstructionEventIndex,
          holdMsRemaining: RECONSTRUCTION_HOLD_MS,
        };
      }

      if (
        finalEventIndex >= 0 &&
        state.eventIndex < finalEventIndex &&
        nextIndex >= finalEventIndex
      ) {
        return {
          ...state,
          status: "final-reveal-hold",
          eventIndex: finalEventIndex,
          holdMsRemaining: FINAL_REVEAL_HOLD_MS,
        };
      }

      if (nextIndex >= maxIndex) {
        return { ...state, status: "done", eventIndex: maxIndex };
      }

      return { ...state, eventIndex: nextIndex };
    }
  }
}
