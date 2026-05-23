#!/usr/bin/env bash
#
# baseline-linux.sh — regenerate Linux Playwright visual baselines from any host.
#
# Why: CI runs Playwright on ubuntu-latest, so the *-chromium-linux.png baselines
# in src/tests/snapshots/visual.spec.ts-snapshots/ must be rendered by Linux
# Chromium. macOS/Windows contributors can't produce them natively. This script
# spins up the official Playwright Docker image — pinned to the same version as
# @playwright/test in package.json — builds Storybook inside the container, and
# runs `playwright test --update-snapshots --project=chromium` so the refreshed
# PNGs land directly in the host repo via a bind mount.
#
# Usage:
#   npm run baseline:linux                # from apps/ui/
#
# Requirements:
#   - Docker installed and running on the host.
#
# Version bump procedure:
#   When you bump @playwright/test in apps/ui/package.json, update
#   PLAYWRIGHT_VERSION below to match. Mismatched versions can produce slightly
#   different renders, which defeats the purpose.

set -euo pipefail

# Keep in sync with @playwright/test in apps/ui/package.json.
PLAYWRIGHT_VERSION="v1.60.0"
IMAGE="mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-jammy"

# Resolve the apps/ui directory (parent of this script's dir) and the repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${UI_DIR}/../.." && pwd)"

# Path to apps/ui inside the container — mirrors the host layout so relative
# paths in playwright.config.ts and the snapshots dir resolve identically.
CONTAINER_UI_DIR="/work/apps/ui"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  echo "Install Docker Desktop (macOS/Windows) or the Docker engine (Linux) and retry." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: docker daemon is not running. Start Docker and retry." >&2
  exit 1
fi

echo "==> Regenerating Linux Playwright baselines via ${IMAGE}"
echo "    repo root:    ${REPO_ROOT}"
echo "    mounting at:  /work"

# Build the command we'll run inside the container. We always reinstall deps
# inside the container because host node_modules (likely darwin-arm64) won't
# work on linux-x64. Storybook gets a fresh static build, then Playwright
# refreshes only the chromium project's snapshots — the darwin baselines on
# disk are untouched.
CONTAINER_CMD=$(cat <<'EOF'
set -euo pipefail
cd /work/apps/ui

echo "==> npm ci (inside container)"
npm ci

echo "==> npm run build-storybook (inside container)"
npm run build-storybook

echo "==> playwright test --update-snapshots --project=chromium"
npx playwright test --update-snapshots --project=chromium
EOF
)

# --rm:           clean up the container on exit
# -t:             allocate a tty so progress output streams nicely
# -v REPO:/work:  bind-mount the repo root so updated PNGs land on the host
# -w:             start inside apps/ui to mirror the contributor's shell
docker run \
  --rm \
  -t \
  -v "${REPO_ROOT}:/work" \
  -w "${CONTAINER_UI_DIR}" \
  "${IMAGE}" \
  bash -c "${CONTAINER_CMD}"
