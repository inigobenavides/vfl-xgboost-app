#!/usr/bin/env bash
#
# test-visual-linux.sh — run Playwright visual regression tests against the
# committed Linux baselines from any host.
#
# Why: per ADR-0002, Linux is the single canonical platform for Playwright
# visual baselines. macOS/Windows contributors can verify a UI change against
# the canonical *-chromium-linux.png files without going through CI by spinning
# up the same Playwright Docker image as `baseline:linux`. Unlike
# `baseline:linux`, this script does NOT pass --update-snapshots — it only
# asserts.
#
# Usage:
#   npm run test:visual:linux             # from apps/ui/
#
# Requirements:
#   - Docker installed and running on the host.

set -euo pipefail

# Resolve the apps/ui directory (parent of this script's dir) and the repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${UI_DIR}/../.." && pwd)"

# Shared Docker constants (IMAGE, CONTAINER_UI_DIR, require_docker) — kept in
# lockstep with baseline-linux.sh so verification and regeneration use the
# identical renderer.
# shellcheck source=./_playwright-docker.sh
source "${SCRIPT_DIR}/_playwright-docker.sh"

require_docker

echo "==> Running Linux Playwright visual tests via ${IMAGE}"
echo "    repo root:    ${REPO_ROOT}"
echo "    mounting at:  /work"

# Build the command we'll run inside the container. We always reinstall deps
# inside the container because host node_modules (likely darwin-arm64) won't
# work on linux-x64. Storybook gets a fresh static build, then Playwright
# asserts (no --update-snapshots) against the committed *-chromium-linux.png
# baselines.
CONTAINER_CMD=$(cat <<'EOF'
set -euo pipefail
cd /work/apps/ui

echo "==> npm ci (inside container)"
npm ci

echo "==> npm run build-storybook (inside container)"
npm run build-storybook

echo "==> playwright test --project=chromium"
npx playwright test --project=chromium
EOF
)

# --rm:           clean up the container on exit
# -t:             allocate a tty so progress output streams nicely
# -v REPO:/work:  bind-mount the repo root so the test report and any diff
#                 artefacts land on the host
# -w:             start inside apps/ui to mirror the contributor's shell
docker run \
  --rm \
  -t \
  -v "${REPO_ROOT}:/work" \
  -w "${CONTAINER_UI_DIR}" \
  "${IMAGE}" \
  bash -c "${CONTAINER_CMD}"
