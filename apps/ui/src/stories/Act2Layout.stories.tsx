/**
 * Act2Layout composition story.
 *
 * Renders the Act 2 view at production viewport width: stage frame
 * wrapping the ribbon header, chapter caption, and three-column grid
 * with status pills on the sides and Filmstrip + AucChart +
 * TreeSummaryPanel in the centre.
 *
 * If App.tsx's Act 2 layout changes, update this helper too. Shared
 * primitives come from components/stage/StageParts.tsx so the two
 * files stay in lockstep.
 */

import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Filmstrip } from "../components/filmstrip/Filmstrip";
import { AucChart } from "../components/auc-chart/AucChart";
import { TreeSummaryPanel } from "../components/tree-summary-panel/TreeSummaryPanel";
import {
  ChapterCaption,
  GuestStatusPill,
  HostStatusPill,
  RibbonHeader,
  STAGE_FRAME_CLASS,
  STAGE_FRAME_STYLE,
} from "../components/stage/StageParts";
import { deriveRunMeta } from "../lib/runMeta";
import type { TraceEvent } from "../lib/trace-reader";
import { ALL_EVENTS, ACT2_ONE_TREE_IDX, FINAL_IDX } from "./trace-fixture";

interface Act2LayoutProps {
  events: TraceEvent[];
  eventIndex: number;
}

function Act2Layout({ events, eventIndex }: Act2LayoutProps) {
  const runMeta = useMemo(() => deriveRunMeta(events), [events]);
  return (
    <div className="min-h-screen bg-ink-0 text-fore-1 font-sans">
      <div className="p-6 pb-44">
        <section className={STAGE_FRAME_CLASS} style={STAGE_FRAME_STYLE}>
          <RibbonHeader
            chapterName="Act 2 — Forest Growth"
            runMeta={runMeta}
          />
          <ChapterCaption isAct2={true} isReconstruction={false} />

          <div className="grid grid-cols-[220px_1fr_220px] gap-4 items-start">
            <GuestStatusPill />

            <section className="flex flex-col gap-4 min-w-0">
              <Filmstrip events={events} eventIndex={eventIndex} />
              <AucChart events={events} eventIndex={eventIndex} />
              <div className="border-t border-line-1 pt-3">
                <TreeSummaryPanel events={events} eventIndex={eventIndex} />
              </div>
            </section>

            <HostStatusPill />
          </div>
        </section>
      </div>
    </div>
  );
}

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
