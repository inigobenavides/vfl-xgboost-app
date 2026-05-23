import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { TitleCard } from "./components/title-card/TitleCard";
import { Hud } from "./components/hud/Hud";
import { TreeView } from "./components/tree-view/TreeView";
import { GuestPanel } from "./components/guest-panel/GuestPanel";
import { HostPanel } from "./components/host-panel/HostPanel";
import { MessageWire } from "./components/message-wire/MessageWire";
import { ReconstructionBeat } from "./components/reconstruction-beat/ReconstructionBeat";
import { Filmstrip } from "./components/filmstrip/Filmstrip";
import { AucChart } from "./components/auc-chart/AucChart";
import { TreeSummaryPanel } from "./components/tree-summary-panel/TreeSummaryPanel";
import { FinalRevealFrame } from "./components/final-reveal/FinalRevealFrame";
import {
  ChapterCaption,
  EmptyTreeScaffold,
  GuestStatusPill,
  HostStatusPill,
  OrnamentMark,
  RibbonHeader,
  STAGE_FRAME_CLASS,
  STAGE_FRAME_STYLE,
  useTreeZeroNodeCount,
} from "./components/stage/StageParts";
import { usePlayback } from "./lib/usePlayback";
import { buildConfig } from "./lib/playback";
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

// ---------------------------------------------------------------------------

function PlayerApp({ events }: PlayerAppProps) {
  const [appStatus, setAppStatus] = useState<AppStatus>("cold-open");
  const [playState, playDispatch] = usePlayback(events);
  const runMeta = deriveRunMeta(events);

  const config = useMemo(() => buildConfig(events), [events]);
  const act2StartIndex =
    config.chapterOffsets.find((c) => c.name === "act2_start")?.eventIndex ?? -1;
  const isAct2 = act2StartIndex >= 0 && playState.eventIndex >= act2StartIndex;
  const isFinalPhase =
    playState.status === "final-reveal-hold" || playState.status === "done";

  const tree0NodeCount = useTreeZeroNodeCount(events, playState.eventIndex);
  const showScaffold = !isAct2 && tree0NodeCount < 4;

  const chapterName = isAct2 ? "Act 2 — Forest Growth" : "Act 1 — First Tree";

  const handleReplay = () => {
    setAppStatus("cold-open");
    playDispatch({ type: "restart" });
  };

  // R key during final phase also resets to cold-open
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === "r" || e.key === "R") && isFinalPhase) {
        setAppStatus("cold-open");
        // usePlayback's own key handler dispatches "restart"
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFinalPhase]);

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

  const onPlay = () => {
    if (appStatus === "cold-open") {
      setAppStatus("playing");
      playDispatch({ type: "play" });
    }
  };

  const isColdOpen = appStatus === "cold-open";

  return (
    <div className="min-h-screen bg-ink-0 text-fore-1 font-sans">
      {/* Title card — visible until first play */}
      {isColdOpen && <TitleCard runMeta={runMeta} onPlay={onPlay} />}

      {/* Main content — shown after cold-open and before final phase */}
      {!isColdOpen && !isFinalPhase && (
        <div className="p-6 pb-44">
          {/* Stage frame — anchors the protocol replay inside a defined "screen" */}
          <section className={STAGE_FRAME_CLASS} style={STAGE_FRAME_STYLE}>
            <RibbonHeader chapterName={chapterName} runMeta={runMeta} />

            {/* Chapter caption — plain-English narration for non-technical viewers */}
            <ChapterCaption
              isAct2={isAct2}
              isReconstruction={playState.status === "reconstruction-hold"}
            />

            {/* Message wire — pills travel above the panels during Act 1 */}
            {!isAct2 && (
              <div className="mb-2">
                <MessageWire events={events} eventIndex={playState.eventIndex} />
              </div>
            )}

            {/* Three-column layout: guest | centre | host */}
            <div className="grid grid-cols-[220px_1fr_220px] gap-4 items-start">
              {/* Left panel — full view in act 1, status pill in act 2 */}
              <AnimatePresence mode="wait">
                {isAct2 ? (
                  <motion.div
                    key="guest-status"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <GuestStatusPill />
                  </motion.div>
                ) : (
                  <motion.div
                    key="guest-panel"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                  >
                    <GuestPanel events={events} eventIndex={playState.eventIndex} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Centre — tree view in act 1, filmstrip + AUC in act 2 */}
              <AnimatePresence mode="wait">
                {isAct2 ? (
                  <motion.section
                    key="act2-centre"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col gap-4"
                  >
                    <Filmstrip events={events} eventIndex={playState.eventIndex} />
                    <AucChart events={events} eventIndex={playState.eventIndex} />
                    <div className="border-t border-line-1 pt-3">
                      <TreeSummaryPanel events={events} eventIndex={playState.eventIndex} />
                    </div>
                  </motion.section>
                ) : (
                  <motion.section
                    key="act1-centre"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.3 }}
                    className="min-w-0 relative"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <OrnamentMark className="text-wire/50" />
                      <h3 className="text-xs font-mono text-mute-2 uppercase tracking-widest">
                        Tree 0
                      </h3>
                    </div>
                    <div className="relative min-h-[360px]">
                      <AnimatePresence>
                        {showScaffold && <EmptyTreeScaffold key="scaffold" />}
                      </AnimatePresence>
                      <TreeView events={events} eventIndex={playState.eventIndex} />
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Right panel — full view in act 1, status pill in act 2 */}
              <AnimatePresence mode="wait">
                {isAct2 ? (
                  <motion.div
                    key="host-status"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <HostStatusPill />
                  </motion.div>
                ) : (
                  <motion.div
                    key="host-panel"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                  >
                    <HostPanel events={events} eventIndex={playState.eventIndex} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      )}

      {/* HUD — always mounted (keeps state machine alive); invisible on cold-open */}
      <Hud
        events={events}
        state={playState}
        dispatch={playDispatch}
        hidden={isColdOpen || isFinalPhase}
      />

      {/* Reconstruction beat overlay — mounts on reconstruction-hold */}
      <AnimatePresence>
        {playState.status === "reconstruction-hold" && (
          <ReconstructionBeat
            events={events}
            holdMsRemaining={playState.holdMsRemaining}
          />
        )}
      </AnimatePresence>

      {/* Final reveal — replaces normal content and HUD */}
      <AnimatePresence>
        {isFinalPhase && (
          <FinalRevealFrame
            events={events}
            isDone={playState.status === "done"}
            onReplay={handleReplay}
          />
        )}
      </AnimatePresence>
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
      <div className="min-h-screen bg-ink-0 flex items-center justify-center">
        <p className="text-mute-2 animate-pulse font-mono">Loading trace…</p>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="min-h-screen bg-ink-0 flex items-center justify-center">
        <p className="text-private font-mono">Error: {errorMsg}</p>
      </div>
    );
  }

  return <PlayerApp events={events} />;
}
