/**
 * Act1Layout composition story.
 *
 * Renders the Act 1 view at production viewport width: stage frame
 * (rounded, bordered, scanline background) wrapping the ribbon header,
 * chapter caption, MessageWire band, and three-column panel grid. The
 * component-level visual tests can only see one component at a time
 * and cannot catch overlap regressions between the wire, the caption,
 * and the surrounding panels — this story closes that gap.
 *
 * If App.tsx's Act 1 layout changes, update this helper too. Shared
 * primitives (RibbonHeader, ChapterCaption, status pills, stage frame
 * tokens, empty-tree scaffold, useTreeZeroNodeCount) come from
 * components/stage/StageParts.tsx to keep the two files in sync.
 */

import { AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { GuestPanel } from "../components/guest-panel/GuestPanel";
import { HostPanel } from "../components/host-panel/HostPanel";
import { MessageWire } from "../components/message-wire/MessageWire";
import { TreeView } from "../components/tree-view/TreeView";
import {
  ChapterCaption,
  EmptyTreeScaffold,
  OrnamentMark,
  RibbonHeader,
  STAGE_FRAME_CLASS,
  STAGE_FRAME_STYLE,
  useTreeZeroNodeCount,
} from "../components/stage/StageParts";
import { deriveRunMeta } from "../lib/runMeta";
import type { TraceEvent } from "../lib/trace-reader";
import { ALL_EVENTS, MID_TREE0_IDX, TREE0_DONE_IDX } from "./trace-fixture";

interface Act1LayoutProps {
  events: TraceEvent[];
  eventIndex: number;
}

function Act1Layout({ events, eventIndex }: Act1LayoutProps) {
  const runMeta = useMemo(() => deriveRunMeta(events), [events]);
  const tree0NodeCount = useTreeZeroNodeCount(events, eventIndex);
  const showScaffold = tree0NodeCount < 4;

  return (
    <div className="min-h-screen bg-ink-0 text-fore-1 font-sans">
      <div className="p-6 pb-44">
        <section className={STAGE_FRAME_CLASS} style={STAGE_FRAME_STYLE}>
          <RibbonHeader chapterName="Act 1 — First Tree" runMeta={runMeta} />
          <ChapterCaption isAct2={false} isReconstruction={false} />

          <div className="mb-2">
            <MessageWire events={events} eventIndex={eventIndex} />
          </div>

          <div className="grid grid-cols-[220px_1fr_220px] gap-4 items-start">
            <GuestPanel events={events} eventIndex={eventIndex} />

            <section className="min-w-0 relative">
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
                <TreeView events={events} eventIndex={eventIndex} />
              </div>
            </section>

            <HostPanel events={events} eventIndex={eventIndex} />
          </div>
        </section>
      </div>
    </div>
  );
}

const meta = {
  component: Act1Layout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Act1Layout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pills in flight, tree not yet rendered — empty-tree scaffold visible. */
export const Early: Story = {
  args: { events: ALL_EVENTS, eventIndex: 5 },
};

/** Half-built tree-0, gradient/hessian strips populated, host feature splits visible. */
export const MidTree0: Story = {
  args: { events: ALL_EVENTS, eventIndex: MID_TREE0_IDX },
};

/** Tree-0 fully expanded — exercises the deep-tree centre column constraint. */
export const FullyGrown: Story = {
  args: { events: ALL_EVENTS, eventIndex: TREE0_DONE_IDX },
};
