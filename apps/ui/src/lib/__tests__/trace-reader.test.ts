import { describe, it, expect } from "vitest";
import {
  parseTrace,
  countByType,
  UnknownEventTypeError,
  type TraceEvent,
} from "../trace-reader";

// ---------------------------------------------------------------------------
// Fixtures — minimal valid records for each event variant
// ---------------------------------------------------------------------------

const TREE_START = JSON.stringify({
  type: "tree_start",
  tree_index: 0,
  n_samples: 100,
  timestamp: "2026-01-01T00:00:00Z",
});

const NODE_EXPANDED = JSON.stringify({
  type: "node_expanded",
  tree_index: 0,
  node_id: "t0/n0",
  parent_id: null,
  depth: 0,
  n_samples: 100,
  samples_l: 60,
  samples_r: 40,
  feature_id: "age",
  threshold_bin: 3,
  gain: 1.23,
  leaf_weight: null,
  is_leaf: false,
  timestamp: "2026-01-01T00:00:00.000001Z",
});

const PROTOCOL_MESSAGE = JSON.stringify({
  type: "protocol_message",
  step: 1,
  node_id: "t0/n0",
  from_party: "guest",
  to_party: "coordinator",
  payload_type: "gradient_shares",
  payload_shape: [100],
  timestamp: "2026-01-01T00:00:00.000002Z",
  privacy_check: {
    raw_values_exposed: false,
    check_passed: true,
    note: "ok",
  },
});

const GAIN_CURVE = JSON.stringify({
  type: "gain_curve",
  tree_index: 0,
  node_id: "t0/n0",
  per_feature: { age: [[0, 0.5], [1, 1.2]] },
  timestamp: "2026-01-01T00:00:00.000003Z",
});

const RECONSTRUCTION_AGGREGATE = JSON.stringify({
  type: "reconstruction_aggregate",
  tree_index: 0,
  node_id: "t0/n0",
  feature_id: "age",
  g_per_bucket: [1.0, 2.0, 3.0],
  h_per_bucket: [0.5, 0.5, 0.5],
  timestamp: "2026-01-01T00:00:00.000004Z",
});

const AUC_DELTA = JSON.stringify({
  type: "auc_delta",
  tree_index: 0,
  auc: 0.85,
  timestamp: "2026-01-01T00:00:00.000005Z",
});

const CHAPTER_MARKER = JSON.stringify({
  type: "chapter_marker",
  chapter: "act1_start",
  timestamp: "2026-01-01T00:00:00.000006Z",
});

// ---------------------------------------------------------------------------
// Tests: every variant parses correctly
// ---------------------------------------------------------------------------

describe("parseTrace — variant round-trips", () => {
  it("parses tree_start", () => {
    const events = parseTrace(TREE_START);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tree_start");
  });

  it("parses node_expanded", () => {
    const events = parseTrace(NODE_EXPANDED);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("node_expanded");
  });

  it("parses protocol_message", () => {
    const events = parseTrace(PROTOCOL_MESSAGE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("protocol_message");
  });

  it("parses gain_curve", () => {
    const events = parseTrace(GAIN_CURVE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("gain_curve");
  });

  it("parses reconstruction_aggregate", () => {
    const events = parseTrace(RECONSTRUCTION_AGGREGATE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("reconstruction_aggregate");
  });

  it("parses auc_delta", () => {
    const events = parseTrace(AUC_DELTA);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("auc_delta");
  });

  it("parses chapter_marker", () => {
    const events = parseTrace(CHAPTER_MARKER);
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.type !== "chapter_marker") throw new Error("wrong type");
    expect(ev.chapter).toBe("act1_start");
  });
});

// ---------------------------------------------------------------------------
// Tests: error cases
// ---------------------------------------------------------------------------

describe("parseTrace — error handling", () => {
  it("throws SyntaxError on malformed JSON", () => {
    expect(() => parseTrace("{not json}")).toThrow(SyntaxError);
  });

  it("throws UnknownEventTypeError for unrecognised type", () => {
    const line = JSON.stringify({ type: "future_event", data: 1 });
    expect(() => parseTrace(line)).toThrow(UnknownEventTypeError);
  });

  it("UnknownEventTypeError carries the offending type name", () => {
    const line = JSON.stringify({ type: "ghost" });
    try {
      parseTrace(line);
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownEventTypeError);
      expect((e as UnknownEventTypeError).eventType).toBe("ghost");
    }
  });

  it("throws UnknownEventTypeError when type field is missing", () => {
    const line = JSON.stringify({ tree_index: 0, n_samples: 10 });
    expect(() => parseTrace(line)).toThrow(UnknownEventTypeError);
  });
});

// ---------------------------------------------------------------------------
// Tests: ordering and blank lines
// ---------------------------------------------------------------------------

describe("parseTrace — ordering and blank lines", () => {
  it("preserves input line order", () => {
    const jsonl = [TREE_START, PROTOCOL_MESSAGE, AUC_DELTA].join("\n");
    const events = parseTrace(jsonl);
    expect(events.map((e) => e.type)).toEqual([
      "tree_start",
      "protocol_message",
      "auc_delta",
    ]);
  });

  it("skips blank lines without error", () => {
    const jsonl = `\n${TREE_START}\n\n${AUC_DELTA}\n`;
    const events = parseTrace(jsonl);
    expect(events).toHaveLength(2);
  });

  it("returns empty array for empty string", () => {
    expect(parseTrace("")).toHaveLength(0);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseTrace("   \n  \n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: countByType
// ---------------------------------------------------------------------------

describe("countByType", () => {
  it("counts each type correctly", () => {
    const allEvents: TraceEvent[] = parseTrace(
      [TREE_START, PROTOCOL_MESSAGE, AUC_DELTA, TREE_START].join("\n"),
    );
    const counts = countByType(allEvents);
    expect(counts.get("tree_start")).toBe(2);
    expect(counts.get("protocol_message")).toBe(1);
    expect(counts.get("auc_delta")).toBe(1);
    expect(counts.get("node_expanded")).toBeUndefined();
  });

  it("returns empty map for empty array", () => {
    expect(countByType([])).toEqual(new Map());
  });
});
