/**
 * Act2Layout composition story.
 *
 * Renders the Act 2 view (header + 3-column grid with status pills on the
 * sides and Filmstrip + AucChart + TreeSummaryPanel in the centre) at a
 * production viewport width.
 *
 * Mirrors the JSX in App.tsx's Act 2 branch. If the Act 2 layout changes,
 * update this helper too — the visual test will catch drift.
 *
 * Strategy chosen for issue #34: Option B (per-tree summary panel).
 * The TreeSummaryPanel fills the dead space below AucChart with a live
 * narrative of "tree N split on feature X with gain Y" that updates as
 * playback advances. This adds storytelling value without introducing new
 * layout concepts — it simply stacks inside the existing flex column.
 */

import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Filmstrip } from "../components/filmstrip/Filmstrip";
import { AucChart } from "../components/auc-chart/AucChart";
import { TreeSummaryPanel } from "../components/tree-summary-panel/TreeSummaryPanel";
import { deriveRunMeta } from "../lib/runMeta";
import type { TraceEvent } from "../lib/trace-reader";
import {
  ALL_EVENTS,
  ACT2_ONE_TREE_IDX,
  FINAL_IDX,
} from "./trace-fixture";

// ---------------------------------------------------------------------------
// Act2Layout helper — mirrors the act2-centre section in App.tsx
// ---------------------------------------------------------------------------

interface Act2LayoutProps {
  events: TraceEvent[];
  eventIndex: number;
}

function GuestStatusPill() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
        <span className="text-xs font-bold text-guest uppercase tracking-widest">Guest</span>
        <span className="text-green-400 text-xs">✓</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-gray-500 bg-gray-900 border border-gray-800 rounded px-2 py-0.5">
          no raw gradients shared
        </span>
        <span className="text-[9px] text-gray-500 bg-gray-900 border border-gray-800 rounded px-2 py-0.5">
          labels remain private
        </span>
      </div>
    </div>
  );
}

function HostStatusPill() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
        <span className="text-xs font-bold text-host uppercase tracking-widest">Host</span>
        <span className="text-green-400 text-xs">✓</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[9px] text-gray-500 bg-gray-900 border border-gray-800 rounded px-2 py-0.5">
          no raw features exposed
        </span>
        <span className="text-[9px] text-gray-500 bg-gray-900 border border-gray-800 rounded px-2 py-0.5">
          histograms only
        </span>
      </div>
    </div>
  );
}

function Act2Layout({ events, eventIndex }: Act2LayoutProps) {
  const runMeta = useMemo(() => deriveRunMeta(events), [events]);
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
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

        <div className="grid grid-cols-[220px_1fr_220px] gap-4 items-start">
          <GuestStatusPill />

          <section className="flex flex-col gap-4">
            <Filmstrip events={events} eventIndex={eventIndex} />
            <AucChart events={events} eventIndex={eventIndex} />
            <div className="border-t border-gray-800 pt-3">
              <TreeSummaryPanel events={events} eventIndex={eventIndex} />
            </div>
          </section>

          <HostStatusPill />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------

const meta = {
  component: Act2Layout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Act2Layout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One tree trained — AUC chart has a single point, summary panel shows tree 1 details. */
export const OneTree: Story = {
  args: { events: ALL_EVENTS, eventIndex: ACT2_ONE_TREE_IDX },
};

/** All 100 trees trained — filmstrip full, AUC curve complete, summary shows last tree. */
export const AllTrees: Story = {
  args: { events: ALL_EVENTS, eventIndex: FINAL_IDX },
};
