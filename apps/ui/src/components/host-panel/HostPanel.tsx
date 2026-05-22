/**
 * HostPanel — symbolic view of the host party's features and histograms.
 *
 * Derived from trace events: feature usage frequency (NodeExpandedEvents) and
 * gain curves (GainCurveEvent) for the histogram view.
 */

import { useMemo } from "react";
import type { GainCurveEvent, TraceEvent } from "../../lib/trace-reader";

// ---------------------------------------------------------------------------
// Data derivation
// ---------------------------------------------------------------------------

interface FeatureUsage {
  name: string;
  count: number;
  normalisedCount: number;
}

interface HostState {
  featureUsage: FeatureUsage[];
  /** Gain curve for the most prominent feature, normalised 0–1. */
  gainCurve: number[];
  gainFeature: string;
}

function useHostState(events: TraceEvent[], eventIndex: number): HostState {
  return useMemo(() => {
    const usageMap = new Map<string, number>();
    let lastGainCurve: GainCurveEvent | null = null;

    for (let i = 0; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type === "node_expanded" && e.tree_index === 0 && e.feature_id) {
        usageMap.set(e.feature_id, (usageMap.get(e.feature_id) ?? 0) + 1);
      }
      if (e.type === "gain_curve" && e.tree_index === 0) {
        lastGainCurve = e;
      }
    }

    const maxCount = Math.max(...Array.from(usageMap.values()), 1);
    const featureUsage: FeatureUsage[] = Array.from(usageMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        normalisedCount: count / maxCount,
      }))
      .sort((a, b) => b.count - a.count);

    // Pick the top feature from the gain curve for histogram
    let gainCurve: number[] = [];
    let gainFeature = "";
    if (lastGainCurve) {
      const topEntry = Object.entries(lastGainCurve.per_feature).sort(
        (a, b) => Math.max(...b[1].map((p) => p[1])) - Math.max(...a[1].map((p) => p[1])),
      )[0];
      if (topEntry) {
        gainFeature = topEntry[0];
        const pairs = topEntry[1];
        if (pairs.length > 0) {
          const maxGain = Math.max(...pairs.map((p) => p[1]), 1e-9);
          gainCurve = pairs.map((p) => p[1] / maxGain);
        }
      }
    }

    return { featureUsage, gainCurve, gainFeature };
  }, [events, eventIndex]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureBar({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-24 truncate shrink-0 text-right font-mono">
        {name}
      </span>
      <div className="flex-1 h-3 bg-gray-800 rounded-sm overflow-hidden">
        <div
          className="h-full bg-host rounded-sm transition-all duration-500"
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

function HistogramBars({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) {
    return (
      <div>
        <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{label}</p>
        <div className="h-12 w-full rounded bg-gray-800 flex items-center justify-center">
          <span className="text-[9px] text-gray-600">waiting…</span>
        </div>
      </div>
    );
  }
  const barW = Math.max(3, Math.floor(200 / values.length));
  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-end gap-px h-12 overflow-hidden">
        {values.map((v, i) => (
          <div
            key={i}
            className="bg-public rounded-t-sm flex-shrink-0"
            style={{ width: barW, height: `${Math.max(5, Math.round(v * 100))}%`, opacity: 0.6 + 0.4 * v }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HostPanel
// ---------------------------------------------------------------------------

interface HostPanelProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function HostPanel({ events, eventIndex }: HostPanelProps) {
  const hs = useHostState(events, eventIndex);

  return (
    <div className="flex flex-col gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-host uppercase tracking-widest">Host</span>
        <span className="text-[10px] text-gray-500">features only</span>
      </div>

      {/* Inbox lane placeholder */}
      <div>
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Inbox</p>
        <div className="h-6 border border-dashed border-gray-800 rounded flex items-center justify-center">
          <span className="text-[9px] text-gray-700">← share pills slice 7</span>
        </div>
      </div>

      {/* Feature usage heatmap */}
      <div className="flex-1 flex flex-col gap-1.5">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Feature splits</p>
        {hs.featureUsage.length === 0 ? (
          <div className="text-[9px] text-gray-600">waiting for splits…</div>
        ) : (
          hs.featureUsage.map((f) => (
            <FeatureBar key={f.name} name={f.name} value={f.normalisedCount} />
          ))
        )}
      </div>

      {/* Histogram / gain curve */}
      <HistogramBars
        values={hs.gainCurve}
        label={hs.gainFeature ? `gain curve — ${hs.gainFeature}` : "histogram"}
      />
    </div>
  );
}
