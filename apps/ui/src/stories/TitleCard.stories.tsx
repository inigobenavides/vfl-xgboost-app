import type { Meta, StoryObj } from "@storybook/react-vite";
import { TitleCard } from "../components/title-card/TitleCard";
import type { RunMeta } from "../lib/runMeta";

const meta = {
  component: TitleCard,
  decorators: [
    (Story) => (
      <div className="bg-gray-950" style={{ width: "100vw", height: "100vh", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TitleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const runMeta: RunMeta = {
  datasetName: "UCI Adult",
  nTrees: 100,
  maxDepth: 6,
  runId: "abc1234",
};

export const Default: Story = {
  args: {
    runMeta,
    onPlay: () => {},
  },
};
