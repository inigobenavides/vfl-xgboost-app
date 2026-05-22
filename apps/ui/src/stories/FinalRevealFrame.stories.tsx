import type { Meta, StoryObj } from "@storybook/react-vite";
import { FinalRevealFrame } from "../components/final-reveal/FinalRevealFrame";
import { ALL_EVENTS } from "./trace-fixture";

const meta = {
  component: FinalRevealFrame,
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FinalRevealFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Held: Story = {
  args: {
    events: ALL_EVENTS,
    isDone: false,
    onReplay: () => {},
  },
};

export const WithReplayOverlay: Story = {
  args: {
    events: ALL_EVENTS,
    isDone: true,
    onReplay: () => {},
  },
};
