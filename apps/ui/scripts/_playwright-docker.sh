#!/usr/bin/env bash
#
# _playwright-docker.sh — shared Playwright Docker constants and helpers.
#
# Sourced by:
#   - baseline-linux.sh    (regenerates *-chromium-linux.png baselines)
#   - test-visual-linux.sh (verifies the suite against committed baselines)
#
# Both scripts MUST run inside the identical container so the canonical Linux
# baselines (per ADR-0002) are produced and verified under the same renderer.
# When you bump @playwright/test in apps/ui/package.json, update
# PLAYWRIGHT_VERSION below to match. Mismatched versions can produce slightly
# different renders, which defeats the purpose.

# Keep in sync with @playwright/test in apps/ui/package.json.
PLAYWRIGHT_VERSION="v1.60.0"
IMAGE="mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-jammy"

# Path to apps/ui inside the container — mirrors the host layout so relative
# paths in playwright.config.ts and the snapshots dir resolve identically.
CONTAINER_UI_DIR="/work/apps/ui"

# require_docker — abort with a helpful message if Docker isn't usable.
require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is not installed or not on PATH." >&2
    echo "Install Docker Desktop (macOS/Windows) or the Docker engine (Linux) and retry." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Error: docker daemon is not running. Start Docker and retry." >&2
    exit 1
  fi
}
