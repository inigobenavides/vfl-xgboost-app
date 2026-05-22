import type { Meta, StoryObj } from "@storybook/react-vite";
import { HostPanel } from "../components/host-panel/HostPanel";
import { ALL_EVENTS, RECONSTRUCTION_IDX } from "./trace-fixture";

const meta = {
  component: HostPanel,
  decorators: [
    (Story) => (
      <div className="p-4 bg-gray-950" style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HostPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: 0,
  },
};

export const WithGainCurve: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: RECONSTRUCTION_IDX,
  },
};
