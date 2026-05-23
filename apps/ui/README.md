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

Visual tests capture screenshots of each Storybook story and compare against committed baselines. Per [ADR-0002](../../docs/adr/0002-playwright-baseline-strategy.md), **Linux is the single canonical platform** for these baselines — the `*-chromium-linux.png` files in `src/tests/snapshots/visual.spec.ts-snapshots/` are the source of truth and are rendered inside the pinned Playwright Docker image. There are no per-OS baselines.

The CI workflow (`.github/workflows/visual-tests.yml`) runs Playwright on `ubuntu-latest` on every push that touches `apps/ui/`.

#### Local workflow

On **Linux** (or in CI), the native command works directly against the committed Linux baselines:

```bash
# Requires a Storybook static build (run build-storybook first)
npm run test:visual
```

On **macOS or Windows**, the native renderer doesn't match the canonical Linux baselines, so use the Docker wrapper to verify against them:

```bash
# From apps/ui/ — requires Docker installed and running on the host
npm run test:visual:linux
```

This spins up the same pinned Playwright Docker image as `baseline:linux` and runs `playwright test --project=chromium` (no `--update-snapshots`) inside the container, asserting against the committed baselines.

#### Regenerating baselines after an intentional UI change

When a visual change should be accepted as the new baseline, regenerate the Linux PNGs from any host:

```bash
# From apps/ui/ — requires Docker installed and running on the host
npm run baseline:linux
```

This pulls the official Playwright Docker image (pinned in `scripts/_playwright-docker.sh` to match `@playwright/test` in `package.json` — shared with `test:visual:linux` so the two scripts stay in lockstep), bind-mounts the repo, builds Storybook inside the container, and runs `playwright test --update-snapshots --project=chromium`. Refreshed `*-chromium-linux.png` files land directly in `src/tests/snapshots/visual.spec.ts-snapshots/` on the host, ready to commit. The first run is slow — it pulls a ~1.5 GB image and runs `npm ci` inside the container.

Commit the refreshed PNGs in the same commit as the UI change; no separate "bootstrap baselines" follow-up is needed.

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
