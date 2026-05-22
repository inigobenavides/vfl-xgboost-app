/**
 * Keyboard handler tests for usePlayback.
 *
 * Each test fires a KeyboardEvent on window and asserts the resulting
 * PlaybackState reflects the correct action — confirming every key→action
 * mapping documented in issue #17.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayback } from "../usePlayback";
import type { TraceEvent } from "../trace-reader";

// ---------------------------------------------------------------------------
// Minimal trace fixture: 10 events with all 4 chapter markers
// ---------------------------------------------------------------------------

function makeEvents(): TraceEvent[] {
  const ts = "2026-01-01T00:00:00Z";
  const node = (id: string): TraceEvent => ({
    type: "node_expanded",
    tree_index: 0,
    node_id: id,
    parent_id: null,
    depth: 0,
    n_samples: 10,
    samples_l: 5,
    samples_r: 5,
    feature_id: null,
    threshold_bin: null,
    gain: null,
    leaf_weight: 0.1,
    is_leaf: true,
    timestamp: ts,
  });
  const chapter = (name: "act1_start" | "reconstruction" | "act2_start" | "final"): TraceEvent => ({
    type: "chapter_marker",
    chapter: name,
    timestamp: ts,
  });

  return [
    // index 0 — act1_start chapter marker
    chapter("act1_start"),
    node("n1"),
    node("n2"),
    // index 3 — reconstruction chapter marker
    chapter("reconstruction"),
    node("n3"),
    // index 5 — act2_start chapter marker
    chapter("act2_start"),
    node("n4"),
    node("n5"),
    node("n6"),
    // index 9 — final chapter marker
    chapter("final"),
  ];
}

function fireKey(key: string, extra: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePlayback keyboard handler", () => {
  const events = makeEvents();

  it("space plays when paused", () => {
    const { result } = renderHook(() => usePlayback(events));
    expect(result.current[0].status).toBe("paused");

    act(() => { fireKey(" "); });
    expect(result.current[0].status).toBe("playing");
  });

  it("space pauses when playing", () => {
    const { result } = renderHook(() => usePlayback(events));

    act(() => { fireKey(" "); });  // play
    expect(result.current[0].status).toBe("playing");

    act(() => { fireKey(" "); });  // pause
    expect(result.current[0].status).toBe("paused");
  });

  it("ArrowRight steps forward", () => {
    const { result } = renderHook(() => usePlayback(events));
    const before = result.current[0].eventIndex;

    act(() => { fireKey("ArrowRight"); });
    expect(result.current[0].eventIndex).toBe(before + 1);
  });

  it("ArrowLeft steps back (clamps at 0)", () => {
    const { result } = renderHook(() => usePlayback(events));
    expect(result.current[0].eventIndex).toBe(0);

    act(() => { fireKey("ArrowLeft"); });
    expect(result.current[0].eventIndex).toBe(0);
  });

  it("ArrowLeft steps back after moving forward", () => {
    const { result } = renderHook(() => usePlayback(events));

    act(() => { fireKey("ArrowRight"); });
    act(() => { fireKey("ArrowRight"); });
    const idx = result.current[0].eventIndex;
    expect(idx).toBe(2);

    act(() => { fireKey("ArrowLeft"); });
    expect(result.current[0].eventIndex).toBe(1);
  });

  it("1 jumps to chapter 0 (act1_start at index 0)", () => {
    const { result } = renderHook(() => usePlayback(events));

    act(() => { fireKey("ArrowRight"); });
    act(() => { fireKey("ArrowRight"); });
    act(() => { fireKey("1"); });
    expect(result.current[0].eventIndex).toBe(0);
  });

  it("2 jumps to chapter 1 (reconstruction at index 3)", () => {
    const { result } = renderHook(() => usePlayback(events));

    act(() => { fireKey("2"); });
    expect(result.current[0].eventIndex).toBe(3);
  });

  it("3 jumps to chapter 2 (act2_start at index 5)", () => {
    const { result } = renderHook(() => usePlayback(events));

    act(() => { fireKey("3"); });
    expect(result.current[0].eventIndex).toBe(5);
  });

  it("4 jumps to chapter 3 (final at index 9)", () => {
    const { result } = renderHook(() => usePlayback(events));

    act(() => { fireKey("4"); });
    expect(result.current[0].eventIndex).toBe(9);
  });

  it("K jumps chapter forward", () => {
    const { result } = renderHook(() => usePlayback(events));
    // Start at index 0 (act1_start), K should move to next chapter
    act(() => { fireKey("K"); });
    expect(result.current[0].eventIndex).toBe(3); // reconstruction
  });

  it("k (lowercase) also jumps chapter forward", () => {
    const { result } = renderHook(() => usePlayback(events));
    act(() => { fireKey("k"); });
    expect(result.current[0].eventIndex).toBe(3);
  });

  it("J jumps chapter back", () => {
    const { result } = renderHook(() => usePlayback(events));
    act(() => { fireKey("3"); });  // jump to act2_start (index 5)
    act(() => { fireKey("J"); });  // back to reconstruction (index 3)
    expect(result.current[0].eventIndex).toBe(3);
  });

  it("j (lowercase) also jumps chapter back", () => {
    const { result } = renderHook(() => usePlayback(events));
    act(() => { fireKey("3"); });
    act(() => { fireKey("j"); });
    expect(result.current[0].eventIndex).toBe(3);
  });

  it("R restarts to index 0 and paused status", () => {
    const { result } = renderHook(() => usePlayback(events));
    act(() => { fireKey("3"); });
    act(() => { fireKey(" "); });  // play

    act(() => { fireKey("R"); });
    expect(result.current[0].eventIndex).toBe(0);
    expect(result.current[0].status).toBe("paused");
  });

  it("r (lowercase) also restarts", () => {
    const { result } = renderHook(() => usePlayback(events));
    act(() => { fireKey("3"); });
    act(() => { fireKey("r"); });
    expect(result.current[0].eventIndex).toBe(0);
  });

  it("does not fire when target is an input element", () => {
    const { result } = renderHook(() => usePlayback(events));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    document.body.removeChild(input);

    // State should remain paused — the handler bails on input targets
    expect(result.current[0].status).toBe("paused");
  });
});
