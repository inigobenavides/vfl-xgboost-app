import { useEffect, useRef, useState } from "react";
import { TitleCard } from "./components/title-card/TitleCard";
import { Hud } from "./components/hud/Hud";
import { deriveRunMeta } from "./lib/runMeta";
import { parseTrace, type TraceEvent } from "./lib/trace-reader";

// ---------------------------------------------------------------------------
// App-level state machine: cold-open → playing → done
// The playback state machine inside Hud handles the fine-grained substates.
// ---------------------------------------------------------------------------

type AppStatus = "loading" | "error" | "cold-open" | "playing" | "done";

interface AppState {
  appStatus: AppStatus;
  events: TraceEvent[];
  errorMsg: string;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    appStatus: "loading",
    events: [],
    errorMsg: "",
  });

  // Notified by Hud when the playback reaches "done"
  const handleDone = () =>
    setState((s) => ({ ...s, appStatus: "done" }));

  // Triggered by TitleCard play button OR Space key while cold-open
  const onPlay = () =>
    setState((s) =>
      s.appStatus === "cold-open" ? { ...s, appStatus: "playing" } : s,
    );

  // Space key while on the title card
  const appStatusRef = useRef(state.appStatus);
  appStatusRef.current = state.appStatus;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " && appStatusRef.current === "cold-open") {
        e.preventDefault();
        onPlay();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // stable — onPlay reads state via closure but is idempotent

  // Load trace on mount
  useEffect(() => {
    fetch("/traces/uci-adult-canonical.jsonl")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const events = parseTrace(text);
        setState({ appStatus: "cold-open", events, errorMsg: "" });
      })
      .catch((err: unknown) => {
        setState({
          appStatus: "error",
          events: [],
          errorMsg: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (state.appStatus === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse font-mono">Loading trace…</p>
      </div>
    );
  }

  if (state.appStatus === "error") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400 font-mono">Error: {state.errorMsg}</p>
      </div>
    );
  }

  const runMeta = deriveRunMeta(state.events);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      {/* Title card overlay — visible until user starts playback */}
      {state.appStatus === "cold-open" && (
        <TitleCard runMeta={runMeta} onPlay={onPlay} />
      )}

      {/* Playback view — always mounted once events are loaded so the
          state machine is ready; hidden behind TitleCard until started */}
      {(state.appStatus === "playing" || state.appStatus === "done") && (
        <div className="p-8 pb-40">
          <h2 className="text-lg font-bold text-white mb-1">
            VFL XGBoost — Protocol Replay
          </h2>
          <p className="text-gray-500 text-xs mb-6">
            {runMeta.datasetName} · {runMeta.nTrees} trees · max_depth{" "}
            {runMeta.maxDepth} · run{" "}
            <span className="text-gray-400">{runMeta.runId}</span>
          </p>

          {state.appStatus === "done" && (
            <div className="mb-4 flex items-center gap-3">
              <span className="text-green-400 text-sm">Replay complete</span>
              <button
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1 transition-colors"
                onClick={() =>
                  setState((s) => ({ ...s, appStatus: "playing" }))
                }
              >
                ↻ Replay
              </button>
            </div>
          )}
        </div>
      )}

      {/* HUD — rendered once events are loaded, regardless of app status.
          Mounted hidden while cold-open so its reducer is ready to play
          as soon as onPlay fires. */}
      {state.events.length > 0 && (
        <Hud
          events={state.events}
          hidden={state.appStatus === "cold-open"}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
