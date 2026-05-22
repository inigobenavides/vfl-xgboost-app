/**
 * Visual regression tests — one screenshot per Storybook story.
 *
 * Runs against the static Storybook build served on port 6006.
 *
 * Update baselines:
 *   npm run test:visual -- --update-snapshots
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Story URL helper
// ---------------------------------------------------------------------------

/** Navigate to a Storybook story by component and story name. */
function storyUrl(component: string, story: string): string {
  // Storybook 10 URL format: /?story=<component>--<story>
  const id = `${component}--${story}`.toLowerCase().replace(/\s+/g, "-");
  return `/?story=${id}&viewMode=story`;
}

const VIEWPORT = { width: 1280, height: 720 };

// ---------------------------------------------------------------------------
// TitleCard
// ---------------------------------------------------------------------------

test.describe("TitleCard", () => {
  test("Default", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(storyUrl("title-card-stories", "default"));
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("title-card-default.png", { maxDiffPixelRatio: 0.02 });
  });
});

// ---------------------------------------------------------------------------
// Hud
// ---------------------------------------------------------------------------

test.describe("Hud", () => {
  for (const story of ["paused", "playing", "act-2"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("hud-stories", story));
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`hud-${story}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
});

// ---------------------------------------------------------------------------
// TreeView
// ---------------------------------------------------------------------------

test.describe("TreeView", () => {
  for (const story of ["empty", "mid-growth", "fully-grown"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("tree-view-stories", story));
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400); // allow Framer Motion to settle
      await expect(page).toHaveScreenshot(`tree-view-${story}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
});

// ---------------------------------------------------------------------------
// GuestPanel
// ---------------------------------------------------------------------------

test.describe("GuestPanel", () => {
  for (const story of ["empty", "with-data"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("guest-panel-stories", story));
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`guest-panel-${story}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
});

// ---------------------------------------------------------------------------
// HostPanel
// ---------------------------------------------------------------------------

test.describe("HostPanel", () => {
  for (const story of ["empty", "with-gain-curve"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("host-panel-stories", story));
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`host-panel-${story}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
});

// ---------------------------------------------------------------------------
// MessageWire
// ---------------------------------------------------------------------------

test.describe("MessageWire", () => {
  for (const story of ["no-messages", "pills-in-flight"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("message-wire-stories", story));
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600); // allow spring animation to settle
      await expect(page).toHaveScreenshot(`message-wire-${story}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
});

// ---------------------------------------------------------------------------
// ReconstructionBeat
// ---------------------------------------------------------------------------

test.describe("ReconstructionBeat", () => {
  for (const story of ["mid-fusion", "post-fusion"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("reconstruction-beat-stories", story));
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await expect(page).toHaveScreenshot(`reconstruction-beat-${story}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
});

// ---------------------------------------------------------------------------
// Filmstrip
// ---------------------------------------------------------------------------

test.describe("Filmstrip", () => {
  for (const story of ["early", "mid", "full"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("filmstrip-stories", story));
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800); // thumbnails mount with staggered animation
      await expect(page).toHaveScreenshot(`filmstrip-${story}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
});

// ---------------------------------------------------------------------------
// AucChart
// ---------------------------------------------------------------------------

test.describe("AucChart", () => {
  for (const story of ["one-point", "full"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(storyUrl("auc-chart-stories", story));
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`auc-chart-${story}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
});

// ---------------------------------------------------------------------------
// FinalRevealFrame
// ---------------------------------------------------------------------------

test.describe("FinalRevealFrame", () => {
  for (const story of ["held", "with-replay-overlay"]) {
    test(story, async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto(storyUrl("final-reveal-frame-stories", story));
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      await expect(page).toHaveScreenshot(`final-reveal-${story}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
});
