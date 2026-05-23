import type { Meta, StoryObj } from "@storybook/react-vite";
import { MessageWire } from "../components/message-wire/MessageWire";
import { ALL_EVENTS, MID_TREE0_IDX } from "./trace-fixture";

const meta = {
  component: MessageWire,
  decorators: [
    (Story) => (
      <div className="p-4 bg-ink-0" style={{ width: 720, position: "relative", height: 120 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageWire>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoMessages: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: 0,
  },
};

export const PillsInFlight: Story = {
  args: {
    events: ALL_EVENTS,
    eventIndex: MID_TREE0_IDX,
  },
};
