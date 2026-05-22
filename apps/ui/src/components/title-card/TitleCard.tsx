import type { RunMeta } from "../../lib/runMeta";

interface TitleCardProps {
  runMeta: RunMeta;
  onPlay: () => void;
}

export function TitleCard({ runMeta, onPlay }: TitleCardProps) {
  const sourceLine = [
    runMeta.datasetName,
    "seed 42",
    `${runMeta.nTrees} trees`,
    `max_depth ${runMeta.maxDepth}`,
  ].join(" · ");

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center z-50">
      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-bold text-white text-center max-w-2xl leading-tight mb-4 px-4">
        Federated XGBoost on UCI Adult
        <br />
        <span className="text-gray-400 text-2xl md:text-3xl font-normal">
          two parties, one model, no shared data
        </span>
      </h1>

      {/* Play button */}
      <button
        className="mt-10 w-20 h-20 rounded-full bg-public hover:bg-blue-400 flex items-center justify-center shadow-lg shadow-blue-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-public focus:ring-offset-2 focus:ring-offset-gray-950"
        onClick={onPlay}
        aria-label="Play demo"
        autoFocus
      >
        {/* Offset the play icon slightly right so it looks centred optically */}
        <span className="text-3xl pl-1 text-white" aria-hidden="true">
          ▶
        </span>
      </button>

      <p className="mt-4 text-gray-500 text-sm">
        Press <kbd className="bg-gray-800 px-1 rounded text-gray-300">Space</kbd> or click to start
      </p>

      {/* Honesty badge — bottom right */}
      <div className="fixed bottom-4 right-4 text-xs text-gray-600 font-mono">
        Replaying run{" "}
        <span className="text-gray-400">{runMeta.runId}</span>
      </div>

      {/* Source line — bottom left */}
      <div className="fixed bottom-4 left-4 text-xs text-gray-600 font-mono">
        {sourceLine}
      </div>
    </div>
  );
}
