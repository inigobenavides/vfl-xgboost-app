/**
 * trace-reader.ts — parse a JSONL string into a typed TraceEvent stream.
 *
 * Types mirror packages/shared/models.py exactly. Unknown event `type` values
 * throw a `UnknownEventTypeError` rather than being silently dropped.
 */

// ---------------------------------------------------------------------------
// Domain types (mirrors Python models)
// ---------------------------------------------------------------------------

export interface PrivacyCheck {
  raw_values_exposed: boolean;
  check_passed: boolean;
  note: string;
}

export interface ProtocolMessageEvent {
  type: "protocol_message";
  step: number;
  node_id: string;
  from_party: string;
  to_party: string;
  payload_type: string;
  payload_shape: number[];
  timestamp: string;
  privacy_check: PrivacyCheck;
}

export interface TreeStartEvent {
  type: "tree_start";
  tree_index: number;
  n_samples: number;
  timestamp: string;
}

export interface NodeExpandedEvent {
  type: "node_expanded";
  tree_index: number;
  node_id: string;
  parent_id: string | null;
  depth: number;
  n_samples: number;
  samples_l: number;
  samples_r: number;
  feature_id: string | null;
  threshold_bin: number | null;
  gain: number | null;
  leaf_weight: number | null;
  is_leaf: boolean;
  timestamp: string;
}

export interface GainCurveEvent {
  type: "gain_curve";
  tree_index: number;
  node_id: string;
  per_feature: Record<string, [number, number][]>;
  timestamp: string;
}

export interface ReconstructionAggregateEvent {
  type: "reconstruction_aggregate";
  tree_index: number;
  node_id: string;
  feature_id: string;
  g_per_bucket: number[];
  h_per_bucket: number[];
  timestamp: string;
}

export interface AucDeltaEvent {
  type: "auc_delta";
  tree_index: number;
  auc: number;
  timestamp: string;
}

export type ChapterName = "act1_start" | "reconstruction" | "act2_start" | "final";

export interface ChapterMarkerEvent {
  type: "chapter_marker";
  chapter: ChapterName;
  timestamp: string;
}

export type TraceEvent =
  | ProtocolMessageEvent
  | TreeStartEvent
  | NodeExpandedEvent
  | GainCurveEvent
  | ReconstructionAggregateEvent
  | AucDeltaEvent
  | ChapterMarkerEvent;

export type TraceEventType = TraceEvent["type"];

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class UnknownEventTypeError extends Error {
  readonly eventType: string;
  readonly lineNumber: number;

  constructor(eventType: string, lineNumber: number) {
    super(`Unknown trace event type "${eventType}" on line ${lineNumber}`);
    this.name = "UnknownEventTypeError";
    this.eventType = eventType;
    this.lineNumber = lineNumber;
  }
}

// ---------------------------------------------------------------------------
// Known types set — keeps the exhaustiveness check in sync with the union
// ---------------------------------------------------------------------------

const KNOWN_TYPES = new Set<TraceEventType>([
  "protocol_message",
  "tree_start",
  "node_expanded",
  "gain_curve",
  "reconstruction_aggregate",
  "auc_delta",
  "chapter_marker",
]);

function isKnownType(t: string): t is TraceEventType {
  return KNOWN_TYPES.has(t as TraceEventType);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL string into an ordered array of TraceEvents.
 *
 * - Blank lines are skipped.
 * - Malformed JSON (SyntaxError) propagates as-is.
 * - Lines whose `type` field is absent or unrecognised throw `UnknownEventTypeError`.
 * - Input line order is preserved in the output.
 */
export function parseTrace(jsonl: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  const lines = jsonl.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;

    // May throw SyntaxError — intentional, caller must handle malformed input.
    const raw = JSON.parse(line) as Record<string, unknown>;

    const eventType = raw["type"];
    if (typeof eventType !== "string" || !isKnownType(eventType)) {
      throw new UnknownEventTypeError(
        typeof eventType === "string" ? eventType : String(eventType),
        i + 1,
      );
    }

    events.push(raw as unknown as TraceEvent);
  }

  return events;
}

/**
 * Count events by type. Returns a map from type name to count.
 */
export function countByType(events: TraceEvent[]): Map<TraceEventType, number> {
  const counts = new Map<TraceEventType, number>();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }
  return counts;
}
