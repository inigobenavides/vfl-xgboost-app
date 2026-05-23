/**
 * MessageWire — animated share-pills flying between party panels.
 *
 * Self-contained horizontal band rendered ABOVE the guest/host panel grid.
 * Pills are driven by ProtocolMessageEvents from the trace. Each pill starts at
 * the coordinator center, then spring-animates to the destination party column.
 * Pills carry only shape/dtype labels — no payload digits.
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

/** Height of the wire band (px). Pills + wire line are centred within this. */
const BAND_HEIGHT = 48;
/** Y of the wire line and pill centres, relative to the band top. */
const WIRE_Y = BAND_HEIGHT / 2;
/** Approximate half-width of a rendered pill badge (px). */
const PILL_HALF_W = 88;
/** How many trailing events to keep pills visible. */
const TRAIL_EVENTS = 8;
/** Noise SVG filter ID — defined once, shared by all pills. */
const NOISE_ID = "vfl-wire-noise";

// ---------------------------------------------------------------------------
// Label formatting
// ---------------------------------------------------------------------------

const TYPE_ABBREV: Record<string, string> = {
  GradientShareResponse: "grad_share",
  HistogramShareResponse: "hist_share",
  SplitDecision: "split_dec",
  ApplySplitRequest: "apply_split",
};

function formatLabel(e: ProtocolMessageEvent): string {
  const name = TYPE_ABBREV[e.payload_type] ?? e.payload_type.slice(0, 12).toLowerCase();
  const shape = e.payload_shape.join("×");
  return `${name}: int64[${shape}]`;
}

// ---------------------------------------------------------------------------
// Data derivation
// ---------------------------------------------------------------------------

interface PillDef {
  id: string;
  label: string;
  side: "left" | "right";
}

function usePills(events: TraceEvent[], eventIndex: number): PillDef[] {
  return useMemo(() => {
    const pills: PillDef[] = [];
    const start = Math.max(0, eventIndex - TRAIL_EVENTS);
    for (let i = start; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type !== "protocol_message") continue;
      const label = formatLabel(e);
      if (e.to_party === "guest" || e.to_party === "guest+host") {
        pills.push({ id: `${i}-L`, label, side: "left" });
      }
      if (e.to_party === "host" || e.to_party === "guest+host") {
        pills.push({ id: `${i}-R`, label, side: "right" });
      }
    }
    return pills;
  }, [events, eventIndex]);
}

// ---------------------------------------------------------------------------
// PillBadge — opaque noise-textured rectangle with shape/dtype label
// ---------------------------------------------------------------------------

function PillBadge({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded border border-wire/50 px-2 py-0.5">
      {/* Noise texture via shared SVG filter */}
      <svg
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <rect width="100%" height="100%" filter={`url(#${NOISE_ID})`} />
      </svg>
      <span className="relative z-10 text-[9px] font-mono text-wire whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SharePill — animated motion wrapper for a single pill
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
      style={{ top: WIRE_Y - 9, left: 0 }}
      initial={{ x: startX - PILL_HALF_W, opacity: 0, scale: 0.55 }}
      animate={{ x: endX - PILL_HALF_W, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, y: 5 }}
      transition={{ type: "spring", stiffness: 170, damping: 22, mass: 0.7 }}
    >
      <PillBadge label={pill.label} />
    </motion.div>
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
      {/* One shared SVG filter definition for all pill noise textures */}
      <svg className="absolute" style={{ width: 0, height: 0, overflow: "hidden" }}>
        <defs>
          <filter id={NOISE_ID} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" seed="7" result="noise" />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.96  0 0 0 0 0.62  0 0 0 0 0.04  1.5 0 0 0 -0.4"
            />
          </filter>
        </defs>
      </svg>

      {/* Horizontal wire line connecting guest ↔ host */}
      <div
        className="absolute h-px bg-wire/15"
        style={{ top: WIRE_Y, left: guestX, width: hostX - guestX }}
      />
      {/* Coordinator dot at center */}
      <div
        className="absolute w-2 h-2 rounded-full bg-wire/30 -translate-x-1/2 -translate-y-1/2"
        style={{ top: WIRE_Y, left: centerX }}
      />

      {/* Animated pills */}
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
