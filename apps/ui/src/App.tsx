import { useEffect, useRef, useState } from "react";
import { TitleCard } from "./components/title-card/TitleCard";
import { Hud } from "./components/hud/Hud";
import { TreeView } from "./components/tree-view/TreeView";
import { GuestPanel } from "./components/guest-panel/GuestPanel";
import { HostPanel } from "./components/host-panel/HostPanel";
import { MessageWire } from "./components/message-wire/MessageWire";
import { usePlayback } from "./lib/usePlayback";
import { deriveRunMeta } from "./lib/runMeta";
import { parseTrace, type TraceEvent } from "./lib/trace-reader";

// ---------------------------------------------------------------------------
// PlayerApp — inner component mounted only when events are loaded.
// Owns the playback state machine and shares eventIndex with all visuals.
// ---------------------------------------------------------------------------

type AppStatus = "cold-open" | "playing" | "done";

interface PlayerAppProps {
  events: TraceEvent[];
}

function PlayerApp({ events }: PlayerAppProps) {
  const [appStatus, setAppStatus] = useState<AppStatus>("cold-open");
  const [playState, playDispatch] = usePlayback(events);
  const runMeta = deriveRunMeta(events);

  // Transition app → done when playback finishes
  const doneNotified = useRef(false);
  useEffect(() => {
    if (playState.status === "done" && !doneNotified.current) {
      doneNotified.current = true;
      setAppStatus("done");
    }
    if (playState.status !== "done") doneNotified.current = false;
  }, [playState.status]);

  // Space while on title card transitions to playing
  const appStatusRef = useRef(appStatus);
  appStatusRef.current = appStatus;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " && appStatusRef.current === "cold-open") {
        e.preventDefault();
        setAppStatus("playing");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const onPlay = () => setAppStatus((s) => (s === "cold-open" ? "playing" : s));

  const isColdOpen = appStatus === "cold-open";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      {/* Title card — visible until first play */}
      {isColdOpen && <TitleCard runMeta={runMeta} onPlay={onPlay} />}

      {/* Main content — shown after cold-open */}
      {!isColdOpen && (
        <div className="p-6 pb-44">
          <header className="mb-4">
            <h2 className="text-lg font-bold text-white">
              VFL XGBoost — Protocol Replay
            </h2>
            <p className="text-gray-500 text-xs">
              {runMeta.datasetName} · {runMeta.nTrees} trees · max_depth{" "}
              {runMeta.maxDepth} · run{" "}
              <span className="text-gray-400">{runMeta.runId}</span>
            </p>
          </header>

          {appStatus === "done" && (
            <div className="mb-4 flex items-center gap-3">
              <span className="text-green-400 text-sm">Replay complete</span>
              <button
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1 transition-colors"
                onClick={() => {
                  setAppStatus("playing");
                  playDispatch({ type: "restart" });
                }}
              >
                ↻ Replay
              </button>
            </div>
          )}

          {/* Three-column layout: guest | tree | host */}
          <div className="relative grid grid-cols-[220px_1fr_220px] gap-4 items-start">
            <GuestPanel events={events} eventIndex={playState.eventIndex} />

            <section>
              <h3 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Tree 0
              </h3>
              <TreeView events={events} eventIndex={playState.eventIndex} />
            </section>

            <HostPanel events={events} eventIndex={playState.eventIndex} />

            <MessageWire events={events} eventIndex={playState.eventIndex} />
          </div>
        </div>
      )}

      {/* HUD — always mounted (keeps state machine alive); invisible on cold-open */}
      <Hud
        events={events}
        state={playState}
        dispatch={playDispatch}
        hidden={isColdOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App — outer shell that handles trace loading
// ---------------------------------------------------------------------------

type LoadStatus = "loading" | "loaded" | "error";

export default function App() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/traces/uci-adult-canonical.jsonl")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setEvents(parseTrace(text));
        setLoadStatus("loaded");
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setLoadStatus("error");
      });
  }, []);

  if (loadStatus === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse font-mono">Loading trace…</p>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400 font-mono">Error: {errorMsg}</p>
      </div>
    );
  }

  return <PlayerApp events={events} />;
}
