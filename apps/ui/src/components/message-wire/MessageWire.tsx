/**
 * MessageWire — animated data-packet cards flying between party panels.
 *
 * Self-contained horizontal band rendered ABOVE the guest/host panel grid.
 * Pills are driven by ProtocolMessageEvents from the trace. Each pill starts
 * at the coordinator centre, then ease-animates to the destination party
 * column. Pills carry only type + shape + dtype — no payload digits.
 *
 * Layout: the band is full-width and matches the panel grid's column geometry,
 * so guestX / hostX line up with the centres of the 220px panels below.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProtocolMessageEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAND_HEIGHT = 72;
const WIRE_Y = BAND_HEIGHT / 2;
const PILL_HALF_W = 110;
const TRAIL_EVENTS = 8;

// ---------------------------------------------------------------------------
// Label formatting
// ---------------------------------------------------------------------------

const TYPE_ABBREV: Record<string, string> = {
  GradientShareResponse: "grad_share",
  HistogramShareResponse: "hist_share",
  SplitDecision: "split_dec",
  ApplySplitRequest: "apply_split",
};

interface PillDef {
  id: string;
  type: string;
  shape: string;
  dtype: string;
  side: "left" | "right";
}

function formatPill(
  e: ProtocolMessageEvent,
  side: "left" | "right",
  i: number,
): PillDef {
  const type =
    TYPE_ABBREV[e.payload_type] ?? e.payload_type.slice(0, 12).toLowerCase();
  return {
    id: `${i}-${side === "left" ? "L" : "R"}`,
    type,
    shape: `[${e.payload_shape.join("×")}]`,
    dtype: "int64",
    side,
  };
}

function usePills(events: TraceEvent[], eventIndex: number): PillDef[] {
  return useMemo(() => {
    const pills: PillDef[] = [];
    const start = Math.max(0, eventIndex - TRAIL_EVENTS);
    for (let i = start; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type !== "protocol_message") continue;
      if (e.to_party === "guest" || e.to_party === "guest+host") {
        pills.push(formatPill(e, "left", i));
      }
      if (e.to_party === "host" || e.to_party === "guest+host") {
        pills.push(formatPill(e, "right", i));
      }
    }
    return pills;
  }, [events, eventIndex]);
}

// ---------------------------------------------------------------------------
// PacketCard — uppercase sans type row, mono dtype + shape chips
// ---------------------------------------------------------------------------

function PacketCard({ pill }: { pill: PillDef }) {
  return (
    <div className="relative flex items-stretch bg-ink-2/85 backdrop-blur-sm border border-wire/40 rounded-chip shadow-glow-wire overflow-hidden">
      {/* Tape-flag stripe */}
      <div className="w-1 bg-wire" />
      <div className="flex flex-col gap-0.5 px-2 py-1">
        <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-wire whitespace-nowrap">
          {pill.type.replace("_", " ")}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono text-mute-2 bg-ink-3 rounded-chip px-1">
            {pill.dtype}
          </span>
          <span className="text-[8px] font-mono text-mute-2 bg-ink-3 rounded-chip px-1">
            {pill.shape}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SharePill — motion wrapper that flies the card from coordinator to endpoint
// ---------------------------------------------------------------------------

interface SharePillProps {
  pill: PillDef;
  startX: number;
  endX: number;
}

function SharePill({ pill, startX, endX }: SharePillProps) {
  return (
    <motion.div
      className="absolute"
      style={{ top: WIRE_Y - 18, left: 0 }}
      initial={{ x: startX - PILL_HALF_W, opacity: 0, scale: 0.6 }}
      animate={{ x: endX - PILL_HALF_W, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, y: 6 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <PacketCard pill={pill} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TravelingLight — small radial-gradient glint that swims along the wire
// ---------------------------------------------------------------------------

function TravelingLight({
  startX,
  endX,
  triggerId,
}: {
  startX: number;
  endX: number;
  triggerId: string;
}) {
  return (
    <motion.div
      key={triggerId}
      className="absolute pointer-events-none"
      style={{
        top: WIRE_Y - 1,
        height: 2,
        width: 60,
        background:
          "radial-gradient(ellipse at center, var(--color-wire-glow) 0%, transparent 70%)",
      }}
      initial={{ x: startX - 30, opacity: 0 }}
      animate={{ x: endX - 30, opacity: [0, 0.85, 0] }}
      transition={{ duration: 0.5, ease: [0.32, 0, 0.16, 1] }}
    />
  );
}

// ---------------------------------------------------------------------------
// MessageWire — self-contained band rendered above the panel grid
// ---------------------------------------------------------------------------

interface MessageWireProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function MessageWire({ events, eventIndex }: MessageWireProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pills = usePills(events, eventIndex);

  // Band matches the panel grid below (cols=[220px_1fr_220px] gap-4, no outer padding).
  // Guest column centre sits 110px from the left edge; host column centre 110px from right.
  const guestX = 110;
  const hostX = width - 110;
  const centerX = width / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full pointer-events-none"
      style={{ height: BAND_HEIGHT }}
      aria-hidden="true"
    >
      {/* Wire line — soft gradient track, fading at the ends */}
      <div
        className="absolute h-px"
        style={{
          top: WIRE_Y,
          left: guestX,
          width: hostX - guestX,
          background:
            "linear-gradient(to right, transparent 0%, var(--color-wire-soft) 18%, var(--color-wire-soft) 82%, transparent 100%)",
          opacity: 0.5,
        }}
      />

      {/* Coordinator dot — white core + amber halo, with an always-pulsing ring */}
      <div
        className="absolute rounded-full bg-fore-0 shadow-glow-wire -translate-x-1/2 -translate-y-1/2"
        style={{ top: WIRE_Y, left: centerX, width: 6, height: 6 }}
      />
      <motion.div
        className="absolute rounded-full border border-wire/60 -translate-x-1/2 -translate-y-1/2"
        style={{ top: WIRE_Y, left: centerX, width: 6, height: 6 }}
        animate={{
          width: [6, 24, 6],
          height: [6, 24, 6],
          opacity: [0.8, 0, 0.8],
        }}
        transition={{ duration: 2.4, ease: "easeOut", repeat: Infinity }}
      />

      {/* Endpoint chevrons — subtle flow direction cues */}
      <div
        className="absolute -translate-y-1/2 text-wire/60 text-[10px] font-mono"
        style={{ top: WIRE_Y, left: guestX - 14 }}
      >
        ◂
      </div>
      <div
        className="absolute -translate-y-1/2 text-wire/60 text-[10px] font-mono"
        style={{ top: WIRE_Y, left: hostX + 6 }}
      >
        ▸
      </div>

      {/* Traveling-light beams — one per pill mount */}
      <AnimatePresence>
        {pills.map((p) => (
          <TravelingLight
            key={`light-${p.id}`}
            triggerId={`light-${p.id}`}
            startX={centerX}
            endX={p.side === "left" ? guestX : hostX}
          />
        ))}
      </AnimatePresence>

      {/* Animated data-packet cards */}
      <AnimatePresence>
        {pills.map((pill) => (
          <SharePill
            key={pill.id}
            pill={pill}
            startX={centerX}
            endX={pill.side === "left" ? guestX : hostX}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
