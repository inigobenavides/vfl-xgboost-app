import type { Meta, StoryObj } from "@storybook/react-vite";
import { GuestPanel } from "../components/guest-panel/GuestPanel";
import { ALL_EVENTS, RECONSTRUCTION_IDX } from "./trace-fixture";

const meta = {
  component: GuestPanel,
  decorators: [
    (Story) => (
      <div className="p-4 bg-gray-950" style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GuestPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: 0,
  },
};

export const WithData: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: RECONSTRUCTION_IDX,
  },
};
