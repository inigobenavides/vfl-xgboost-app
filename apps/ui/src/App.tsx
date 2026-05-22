import { useEffect, useState } from "react";
import {
  parseTrace,
  countByType,
  type TraceEvent,
  type TraceEventType,
} from "./lib/trace-reader";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; events: TraceEvent[]; counts: Map<TraceEventType, number> }
  | { status: "error"; message: string };

const TYPE_ORDER: TraceEventType[] = [
  "chapter_marker",
  "tree_start",
  "node_expanded",
  "protocol_message",
  "gain_curve",
  "reconstruction_aggregate",
  "auc_delta",
];

const TYPE_COLORS: Record<TraceEventType, string> = {
  chapter_marker: "text-wire",
  tree_start: "text-guest",
  node_expanded: "text-host",
  protocol_message: "text-wire",
  gain_curve: "text-public",
  reconstruction_aggregate: "text-private",
  auc_delta: "text-host",
};

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    setState({ status: "loading" });
    fetch("/traces/uci-adult-canonical.jsonl")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const events = parseTrace(text);
        const counts = countByType(events);
        setState({ status: "loaded", events, counts });
      })
      .catch((err: unknown) => {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-mono">
      <h1 className="text-2xl font-bold mb-2 text-white">
        VFL XGBoost — Trace Loader
      </h1>
      <p className="text-gray-400 mb-8 text-sm">
        Federated vertical XGBoost · UCI Adult · canonical trace
      </p>

      {state.status === "idle" && (
        <p className="text-gray-500">Waiting…</p>
      )}

      {state.status === "loading" && (
        <p className="text-gray-400 animate-pulse">Loading trace…</p>
      )}

      {state.status === "error" && (
        <p className="text-red-400">Error: {state.message}</p>
      )}

      {state.status === "loaded" && (
        <div>
          <p className="text-green-400 text-lg mb-6">
            Loaded{" "}
            <span className="text-white font-bold">
              {state.events.length.toLocaleString()}
            </span>{" "}
            events
          </p>

          <table className="border-collapse text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left pr-8 pb-2">Event type</th>
                <th className="text-right pb-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.filter((t) => state.counts.has(t)).map((t) => (
                <tr key={t} className="border-b border-gray-900">
                  <td className={`pr-8 py-1 ${TYPE_COLORS[t]}`}>{t}</td>
                  <td className="text-right text-gray-200 py-1">
                    {state.counts.get(t)!.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
