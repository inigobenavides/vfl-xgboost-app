import { useEffect, useState } from "react";
import { Hud } from "./components/hud/Hud";
import {
  countByType,
  parseTrace,
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
  const [load, setLoad] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    setLoad({ status: "loading" });
    fetch("/traces/uci-adult-canonical.jsonl")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const events = parseTrace(text);
        const counts = countByType(events);
        setLoad({ status: "loaded", events, counts });
      })
      .catch((err: unknown) => {
        setLoad({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 pb-40 font-mono">
      <h1 className="text-2xl font-bold mb-2 text-white">
        VFL XGBoost — Protocol Replay
      </h1>
      <p className="text-gray-400 mb-8 text-sm">
        Federated vertical XGBoost · UCI Adult · canonical trace
      </p>

      {load.status === "idle" && <p className="text-gray-500">Waiting…</p>}

      {load.status === "loading" && (
        <p className="text-gray-400 animate-pulse">Loading trace…</p>
      )}

      {load.status === "error" && (
        <p className="text-red-400">Error: {load.message}</p>
      )}

      {load.status === "loaded" && (
        <>
          <p className="text-green-400 text-lg mb-4">
            Loaded{" "}
            <span className="text-white font-bold">
              {load.events.length.toLocaleString()}
            </span>{" "}
            events
          </p>

          <table className="border-collapse text-sm mb-6">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left pr-8 pb-2">Event type</th>
                <th className="text-right pb-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.filter((t) => load.counts.has(t)).map((t) => (
                <tr key={t} className="border-b border-gray-900">
                  <td className={`pr-8 py-1 ${TYPE_COLORS[t]}`}>{t}</td>
                  <td className="text-right text-gray-200 py-1">
                    {load.counts.get(t)!.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-gray-500 text-xs mb-2">
            Keyboard: <kbd className="bg-gray-800 px-1 rounded">Space</kbd> play/pause ·{" "}
            <kbd className="bg-gray-800 px-1 rounded">← →</kbd> step ·{" "}
            <kbd className="bg-gray-800 px-1 rounded">J K</kbd> chapter ·{" "}
            <kbd className="bg-gray-800 px-1 rounded">1–4</kbd> jump ·{" "}
            <kbd className="bg-gray-800 px-1 rounded">R</kbd> restart
          </p>

          <Hud events={load.events} />
        </>
      )}
    </div>
  );
}
