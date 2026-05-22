import type { Meta, StoryObj } from "@storybook/react-vite";
import { Hud } from "../components/hud/Hud";
import type { PlaybackState } from "../lib/playback";
import {
  ALL_EVENTS,
  MID_TREE0_IDX,
  ACT2_ONE_TREE_IDX,
} from "./trace-fixture";

const meta = {
  component: Hud,
  decorators: [
    (Story) => (
      <div className="bg-gray-950 p-4" style={{ width: 800, position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Hud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {
  args: {
    events: ALL_EVENTS,
    state: {
      status: "paused",
      eventIndex: MID_TREE0_IDX,
      speed: 1,
      holdMsRemaining: 0,
    } satisfies PlaybackState,
    dispatch: () => {},
    hidden: false,
  },
};

export const Playing: Story = {
  args: {
    events: ALL_EVENTS,
    state: {
      status: "playing",
      eventIndex: MID_TREE0_IDX,
      speed: 1,
      holdMsRemaining: 0,
    } satisfies PlaybackState,
    dispatch: () => {},
    hidden: false,
  },
};

export const Act2: Story = {
  args: {
    events: ALL_EVENTS,
    state: {
      status: "playing",
      eventIndex: ACT2_ONE_TREE_IDX,
      speed: 2,
      holdMsRemaining: 0,
    } satisfies PlaybackState,
    dispatch: () => {},
    hidden: false,
  },
};
