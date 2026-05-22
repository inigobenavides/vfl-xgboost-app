# VFL XGBoost — UI

Replay visualizer for the vertical federated XGBoost protocol trace. Animates the training loop step-by-step: split-finding, gradient sharing, tree growth, reconstruction beat, and final reveal.

## Development

```bash
npm install
npm run dev          # Vite dev server on :5173
```

## Storybook

Component stories are written in CSF3 format and driven by the canonical UCI Adult trace (`traces/uci-adult-canonical.jsonl`).

```bash
npm run storybook          # dev server on :6006
npm run build-storybook    # build static bundle → storybook-static/
```

## Testing

### Unit tests (Vitest)

```bash
npm test               # run once
npm run test:watch     # watch mode
```

### Visual regression (Playwright)

Visual tests capture screenshots of each Storybook story and compare against committed baselines.

```bash
# Requires a Storybook static build (run build-storybook first)
npm run test:visual

# Update baselines after intentional UI changes
npm run test:visual -- --update-snapshots
```

Baselines live in `src/tests/snapshots/`. The CI workflow (`.github/workflows/visual-tests.yml`) runs these on every push that touches `apps/ui/`.

## Component overview

| Component | Description |
|---|---|
| `TitleCard` | Cold-open title splash |
| `Hud` | Playback controls + chapter indicator |
| `TreeView` | Live animated tree for the current tree under construction |
| `GuestPanel` | Guest party feature list + gradient metadata |
| `HostPanel` | Host party feature list + gain curve |
| `MessageWire` | Animated share pills flying between coordinator and parties |
| `ReconstructionBeat` | Full-screen overlay during the reconstruction hold |
| `Filmstrip` | Thumbnail strip of completed trees |
| `AucChart` | Step-driven AUC curve |
| `FinalRevealFrame` | Summary screen with full tree grid + replay button |

## Trace format

The app reads a JSONL protocol trace from `traces/uci-adult-canonical.jsonl`. Each line is a typed event; the full schema is defined in `src/lib/trace-reader.ts`.

Key event types: `chapter_marker`, `node_expanded`, `protocol_message`, `auc_delta`, `reconstruction_aggregate`, `privacy_check`, `tree_start`.
