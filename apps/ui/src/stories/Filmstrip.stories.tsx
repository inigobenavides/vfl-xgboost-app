import type { Meta, StoryObj } from "@storybook/react-vite";
import { Filmstrip } from "../components/filmstrip/Filmstrip";
import {
  ALL_EVENTS,
  ACT2_START_IDX,
  ACT2_ONE_TREE_IDX,
  FINAL_IDX,
} from "./trace-fixture";

const meta = {
  component: Filmstrip,
  decorators: [
    (Story) => (
      <div className="bg-gray-950 p-4" style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Filmstrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Early: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: ACT2_START_IDX + 1,
  },
};

export const Mid: Story = {
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
