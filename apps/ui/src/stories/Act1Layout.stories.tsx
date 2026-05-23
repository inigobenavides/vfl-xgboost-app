/**
 * Act1Layout composition story.
 *
 * Renders the Act 1 view (header + MessageWire band + 3-column panel grid)
 * at a production viewport width. The component-level visual tests can only
 * see one component at a time and cannot catch overlap regressions between
 * the wire and the surrounding panels — this story closes that gap.
 *
 * The Act1Layout helper below mirrors the JSX in App.tsx's Act 1 branch.
 * If App.tsx's Act 1 layout changes, update this helper too — the visual
 * test will catch any drift that is visible to the user.
 */

import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { GuestPanel } from "../components/guest-panel/GuestPanel";
import { HostPanel } from "../components/host-panel/HostPanel";
import { MessageWire } from "../components/message-wire/MessageWire";
import { TreeView } from "../components/tree-view/TreeView";
import { deriveRunMeta } from "../lib/runMeta";
import type { TraceEvent } from "../lib/trace-reader";
import { ALL_EVENTS, MID_TREE0_IDX, TREE0_DONE_IDX } from "./trace-fixture";

interface Act1LayoutProps {
  events: TraceEvent[];
  eventIndex: number;
}

function Act1Layout({ events, eventIndex }: Act1LayoutProps) {
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

        <div className="mb-2">
          <MessageWire events={events} eventIndex={eventIndex} />
        </div>

        <div className="grid grid-cols-[220px_1fr_220px] gap-4 items-start">
          <GuestPanel events={events} eventIndex={eventIndex} />
          <section className="min-w-0">
            <h3 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
              Tree 0
            </h3>
            <TreeView events={events} eventIndex={eventIndex} />
          </section>
          <HostPanel events={events} eventIndex={eventIndex} />
        </div>
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

/** Pills in flight, tree not yet rendered — surfaces the MessageWire/panel overlap class of bug. */
export const Early: Story = {
  args: { events: ALL_EVENTS, eventIndex: 5 },
};

/** Half-built tree-0, gradient/hessian strips populated, host feature splits visible. */
export const MidTree0: Story = {
  args: { events: ALL_EVENTS, eventIndex: MID_TREE0_IDX },
};

/** Tree-0 fully expanded — exercises the deep-tree center column constraint. */
export const FullyGrown: Story = {
  args: { events: ALL_EVENTS, eventIndex: TREE0_DONE_IDX },
};
