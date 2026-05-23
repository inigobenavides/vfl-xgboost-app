/**
 * AucChart — Recharts line chart showing AUC-per-tree as AucDeltaEvents advance.
 */

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { TraceEvent } from "../../lib/trace-reader";

interface AucChartProps {
  events: TraceEvent[];
  eventIndex: number;
}

export function AucChart({ events, eventIndex }: AucChartProps) {
  const data = useMemo(() => {
    const points: Array<{ tree: number; auc: number }> = [];
    for (let i = 0; i <= eventIndex && i < events.length; i++) {
      const e = events[i];
      if (e.type === "auc_delta") {
        points.push({ tree: e.tree_index, auc: Number(e.auc.toFixed(4)) });
      }
    }
    return points;
  }, [events, eventIndex]);

  const lastAuc = data.length > 0 ? data[data.length - 1].auc : null;

  // With fewer than 2 points the Recharts YAxis "auto" domain collapses around
  // a single value and renders three stacked "0" tick labels. Rather than
  // displaying a misleading single-dot chart we show a labelled placeholder —
  // there is no trend to communicate until a second tree has been trained.
  const sparse = data.length < 2;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">AUC</p>
        {lastAuc !== null && (
          <span className="text-[10px] font-mono text-public tabular-nums">
            {lastAuc.toFixed(4)}
          </span>
        )}
      </div>
      {sparse ? (
        <div
          className="flex items-center justify-center text-[10px] text-gray-600 italic"
          style={{ height: 80 }}
        >
          AUC will plot here once trees train
        </div>
      ) : (
        <ResponsiveContainer width="100%" aspect={3}>
          <LineChart data={data} margin={{ top: 4, right: 6, left: -24, bottom: 0 }}>
            <XAxis
              dataKey="tree"
              tick={{ fontSize: 8, fill: "#4b5563" }}
              tickLine={false}
              axisLine={false}
              label={undefined}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 8, fill: "#4b5563" }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #374151",
                borderRadius: 4,
                fontSize: 9,
                padding: "2px 6px",
              }}
              itemStyle={{ color: "#3b82f6" }}
              labelStyle={{ color: "#9ca3af" }}
              formatter={(v) => [typeof v === "number" ? v.toFixed(4) : String(v), "AUC"]}
              labelFormatter={(l) => `tree ${String(l)}`}
            />
            {data.length > 0 && (
              <ReferenceLine
                y={data[0].auc}
                stroke="#374151"
                strokeDasharray="3 3"
                strokeWidth={0.5}
              />
            )}
            <Line
              type="monotone"
              dataKey="auc"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
