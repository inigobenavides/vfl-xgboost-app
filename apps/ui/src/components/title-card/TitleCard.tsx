import type { RunMeta } from "../../lib/runMeta";

interface TitleCardProps {
  runMeta: RunMeta;
  onPlay: () => void;
}

// ---------------------------------------------------------------------------
// CornerBracket — L-shaped ornament rendered at each viewport corner.
// ---------------------------------------------------------------------------

type Corner = "tl" | "tr" | "bl" | "br";

const CORNER_PATHS: Record<Corner, string> = {
  tl: "M2 12 V2 H12",
  tr: "M28 12 V2 H18",
  bl: "M2 18 V28 H12",
  br: "M28 18 V28 H18",
};

function CornerBracket({ corner }: { corner: Corner }) {
  const positionClass = {
    tl: "top-6 left-6",
    tr: "top-6 right-6",
    bl: "bottom-6 left-6",
    br: "bottom-6 right-6",
  }[corner];

  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      className={`fixed ${positionClass} text-line-2`}
      aria-hidden="true"
    >
      <path
        d={CORNER_PATHS[corner]}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="square"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TitleCard
// ---------------------------------------------------------------------------

export function TitleCard({ runMeta, onPlay }: TitleCardProps) {
  const sourceLine = [
    runMeta.datasetName,
    "seed 42",
    `${runMeta.nTrees} trees`,
    `max_depth ${runMeta.maxDepth}`,
  ].join(" · ");

  return (
    <div className="fixed inset-0 bg-ink-0 flex flex-col items-center justify-center z-50">
      {/* Four corner brackets — frame the cold-open like a printed title plate */}
      <CornerBracket corner="tl" />
      <CornerBracket corner="tr" />
      <CornerBracket corner="bl" />
      <CornerBracket corner="br" />

      {/* Title */}
      <h1 className="text-center max-w-4xl leading-tight mb-6 px-6">
        <span className="block text-2xl md:text-[64px] font-display font-semibold text-fore-2 leading-[1.05]">
          Federated XGBoost on UCI Adult
        </span>
        <span className="block mt-3 text-lg md:text-2xl font-display italic text-mute-2">
          two parties, one model, no shared data
        </span>
      </h1>

      {/* Play button */}
      <button
        className="mt-10 w-20 h-20 rounded-full bg-public flex items-center justify-center shadow-stage transition-[transform,filter] hover:brightness-110 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-public focus:ring-offset-2 focus:ring-offset-ink-0"
        onClick={onPlay}
        aria-label="Play demo"
        autoFocus
      >
        {/* Offset the play icon slightly right so it looks centred optically */}
        <span className="text-3xl pl-1 text-fore-0" aria-hidden="true">
          ▶
        </span>
      </button>

      <p className="mt-4 text-mute-2 text-sm font-sans">
        Press{" "}
        <kbd className="bg-ink-3 px-1.5 py-0.5 rounded-chip text-fore-1 font-mono text-xs">
          Space
        </kbd>{" "}
        or click to start
      </p>

      {/* Honesty badge — bottom right */}
      <div className="fixed bottom-5 right-12 text-xs text-mute-1 font-mono">
        Replaying run <span className="text-fore-1">{runMeta.runId}</span>
      </div>

      {/* Source line — bottom left */}
      <div className="fixed bottom-5 left-12 text-xs text-mute-1 font-mono">
        {sourceLine}
      </div>
    </div>
  );
}
