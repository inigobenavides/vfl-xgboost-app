import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  buildConfig,
  currentChapterIndex,
  initialState,
  reduce,
  type PlaybackAction,
  type PlaybackConfig,
  type PlaybackState,
} from "./playback";
import type { TraceEvent } from "./trace-reader";

export type { PlaybackAction, PlaybackConfig, PlaybackState };
export { currentChapterIndex };

/** React hook wiring the pure playback reducer to RAF and keyboard. */
export function usePlayback(
  events: TraceEvent[],
): [PlaybackState, (action: PlaybackAction) => void] {
  const config = useRef<PlaybackConfig>(buildConfig(events));
  config.current = buildConfig(events);

  const [state, rawDispatch] = useReducer(
    (s: PlaybackState, a: PlaybackAction) => reduce(s, a, config.current),
    initialState(),
  );

  const dispatch = useCallback((action: PlaybackAction) => rawDispatch(action), []);

  // RAF loop — active only when playing or in a hold state
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
    const active =
      state.status === "playing" ||
      state.status === "reconstruction-hold" ||
      state.status === "final-reveal-hold";
    if (!active) return;

    let lastTime = performance.now();
    let rafId: number;
    const frame = (now: number) => {
      dispatch({ type: "tick", deltaMs: now - lastTime });
      lastTime = now;
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [state.status, dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          dispatch(
            statusRef.current === "playing"
              ? { type: "pause" }
              : { type: "play" },
          );
          break;
        case "ArrowLeft":
          e.preventDefault();
          dispatch({ type: "step-back" });
          break;
        case "ArrowRight":
          e.preventDefault();
          dispatch({ type: "step-forward" });
          break;
        case "j":
        case "J":
          dispatch({ type: "jump-chapter", direction: "back" });
          break;
        case "k":
        case "K":
          dispatch({ type: "jump-chapter", direction: "forward" });
          break;
        case "1":
          dispatch({ type: "jump-to-chapter", chapterIndex: 0 });
          break;
        case "2":
          dispatch({ type: "jump-to-chapter", chapterIndex: 1 });
          break;
        case "3":
          dispatch({ type: "jump-to-chapter", chapterIndex: 2 });
          break;
        case "4":
          dispatch({ type: "jump-to-chapter", chapterIndex: 3 });
          break;
        case "r":
        case "R":
          dispatch({ type: "restart" });
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dispatch]);

  return [state, dispatch];
}
