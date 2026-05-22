import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReconstructionBeat } from "../components/reconstruction-beat/ReconstructionBeat";
import { RECONSTRUCTION_HOLD_MS } from "../lib/playback";
import { ALL_EVENTS } from "./trace-fixture";

const meta = {
  component: ReconstructionBeat,
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReconstructionBeat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MidFusion: Story = {
  args: {
    events: ALL_EVENTS,
    holdMsRemaining: RECONSTRUCTION_HOLD_MS * 0.7,
  },
};

export const PostFusion: Story = {
  args: {
    events: ALL_EVENTS,
    holdMsRemaining: RECONSTRUCTION_HOLD_MS * 0.2,
  },
};
