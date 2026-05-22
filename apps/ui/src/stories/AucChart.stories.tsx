import type { Meta, StoryObj } from "@storybook/react-vite";
import { AucChart } from "../components/auc-chart/AucChart";
import { ALL_EVENTS, ACT2_ONE_TREE_IDX, FINAL_IDX } from "./trace-fixture";

const meta = {
  component: AucChart,
  decorators: [
    (Story) => (
      <div className="bg-gray-950 p-4" style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AucChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnePoint: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: ACT2_ONE_TREE_IDX,
  },
};

export const Full: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: FINAL_IDX,
  },
};
