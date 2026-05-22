import type { Meta, StoryObj } from "@storybook/react-vite";
import { TreeView } from "../components/tree-view/TreeView";
import {
  ALL_EVENTS,
  MID_TREE0_IDX,
  TREE0_DONE_IDX,
} from "./trace-fixture";

const meta = {
  component: TreeView,
  decorators: [
    (Story) => (
      <div className="bg-gray-950 p-4" style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: 0,
  },
};

export const MidGrowth: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: MID_TREE0_IDX,
  },
};

export const FullyGrown: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: TREE0_DONE_IDX,
  },
};
