import type { Meta, StoryObj } from "@storybook/react-vite";
import { TreeSummaryPanel } from "../components/tree-summary-panel/TreeSummaryPanel";
import {
  ALL_EVENTS,
  ACT2_START_IDX,
  ACT2_ONE_TREE_IDX,
  FINAL_IDX,
} from "./trace-fixture";

const meta = {
  component: TreeSummaryPanel,
  decorators: [
    (Story) => (
      <div className="bg-gray-950 p-4" style={{ width: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreeSummaryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No trees complete yet — shows "Waiting for first tree…" placeholder. */
export const Empty: Story = {
  args: { events: ALL_EVENTS, eventIndex: ACT2_START_IDX },
};

/** First tree finished — summary shows tree 1 splits and leaf weights. */
export const OneTree: Story = {
  args: { events: ALL_EVENTS, eventIndex: ACT2_ONE_TREE_IDX },
};

/** All 100 trees trained — summary shows the last tree's details. */
export const AllTrees: Story = {
  args: { events: ALL_EVENTS, eventIndex: FINAL_IDX },
};
