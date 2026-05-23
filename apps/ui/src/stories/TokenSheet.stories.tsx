/**
 * TokenSheet — visual specimen of the design system tokens.
 *
 * Not used in production. Lives only to validate token additions in Storybook
 * before they're applied across components.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-16 h-12 rounded-card border border-line-1"
        style={{ background: `var(${varName})` }}
      />
      <div className="flex flex-col">
        <span className="text-sm font-sans font-medium text-fore-2">{name}</span>
        <span className="text-xs font-mono text-mute-2">{varName}</span>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-display font-semibold text-fore-2 mb-4 mt-10 first:mt-0">
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

function TokenSheet() {
  return (
    <div className="min-h-screen bg-ink-0 text-fore-1 font-sans p-10">
      <header className="mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-wire mb-2">
          design system
        </p>
        <h1 className="text-2xl font-display font-semibold text-fore-2">
          Token sheet
        </h1>
        <p className="text-sm text-mute-2 mt-1">
          Visual specimen of the colour ramp, accents, typography, and motion
          tokens used across the protocol replay UI.
        </p>
      </header>

      {/* Grayscale ramp */}
      <SectionTitle>Grayscale ramp</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Swatch name="Ink 0 — page void" varName="--color-ink-0" />
        <Swatch name="Ink 1 — panel bg" varName="--color-ink-1" />
        <Swatch name="Ink 2 — elevated card" varName="--color-ink-2" />
        <Swatch name="Ink 3 — hover / well" varName="--color-ink-3" />
        <Swatch name="Line 1 — hairline" varName="--color-line-1" />
        <Swatch name="Line 2 — prominent" varName="--color-line-2" />
        <Swatch name="Mute 1 — faint label" varName="--color-mute-1" />
        <Swatch name="Mute 2 — secondary" varName="--color-mute-2" />
        <Swatch name="Fore 1 — body" varName="--color-fore-1" />
        <Swatch name="Fore 2 — heading" varName="--color-fore-2" />
        <Swatch name="Fore 0 — hero numeral" varName="--color-fore-0" />
      </div>

      {/* Accent palette */}
      <SectionTitle>Semantic accents</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Swatch name="Guest — iris" varName="--color-guest" />
        <Swatch name="Guest soft" varName="--color-guest-soft" />
        <Swatch name="Host — spring teal" varName="--color-host" />
        <Swatch name="Host soft" varName="--color-host-soft" />
        <Swatch name="Wire — warm amber" varName="--color-wire" />
        <Swatch name="Wire soft" varName="--color-wire-soft" />
        <Swatch name="Wire glow" varName="--color-wire-glow" />
        <Swatch name="Private — coral" varName="--color-private" />
        <Swatch name="Public — sky-cyan" varName="--color-public" />
      </div>

      {/* Typography */}
      <SectionTitle>Typography</SectionTitle>
      <div className="flex flex-col gap-6 bg-ink-1 border border-line-1 rounded-card p-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-mute-1 mb-1">
            Display — Fraunces (variable serif)
          </p>
          <p className="text-hero font-display font-semibold text-fore-0 leading-none">
            0.9143
          </p>
          <p className="text-2xl font-display text-fore-2 mt-2">
            Federated XGBoost on UCI Adult
          </p>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-mute-1 mb-1">
            Sans — Inter Tight
          </p>
          <p className="text-xl font-sans font-semibold text-fore-2">
            VFL XGBoost — Protocol Replay
          </p>
          <p className="text-base font-sans text-fore-1 mt-1">
            Two parties, one model, no shared data.
          </p>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-mute-1 mb-1">
            Mono — JetBrains Mono
          </p>
          <p className="text-sm font-mono text-wire">
            grad_share: int64[256×16]
          </p>
          <p className="text-xs font-mono text-mute-2 mt-1">
            run 5273d7b · seed 42 · 100 trees · max_depth 4
          </p>
        </div>
      </div>

      {/* Type scale */}
      <SectionTitle>Type scale</SectionTitle>
      <div className="flex flex-col gap-3 bg-ink-1 border border-line-1 rounded-card p-6">
        {(
          [
            ["text-hero", "Hero numeral"],
            ["text-2xl", "Display heading"],
            ["text-xl", "Section title"],
            ["text-lg", "Subtitle"],
            ["text-base", "Body"],
            ["text-sm", "Secondary"],
            ["text-xs", "Caption"],
          ] as const
        ).map(([size, label]) => (
          <div key={size} className="flex items-baseline gap-4">
            <code className="text-xs font-mono text-mute-1 w-20 shrink-0">
              {size}
            </code>
            <span className={`${size} font-display text-fore-2`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Radii + shadows */}
      <SectionTitle>Radii &amp; shadows</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-ink-2 border border-line-1 rounded-chip p-6 text-center">
          <p className="text-xs font-mono text-mute-2 mb-2">--radius-chip</p>
          <p className="text-sm font-sans text-fore-2">4px</p>
        </div>
        <div className="bg-ink-2 border border-line-1 rounded-card shadow-card p-6 text-center">
          <p className="text-xs font-mono text-mute-2 mb-2">--radius-card · shadow-card</p>
          <p className="text-sm font-sans text-fore-2">10px</p>
        </div>
        <div className="bg-ink-1 border border-line-1 rounded-stage shadow-stage p-6 text-center">
          <p className="text-xs font-mono text-mute-2 mb-2">--radius-stage · shadow-stage</p>
          <p className="text-sm font-sans text-fore-2">18px</p>
        </div>
        <div className="col-span-3 bg-ink-2 border border-wire/40 rounded-card shadow-glow-wire p-6 text-center">
          <p className="text-xs font-mono text-wire mb-2">--shadow-glow-wire</p>
          <p className="text-sm font-sans text-fore-2">Amber halo for wire-band elements</p>
        </div>
      </div>

      {/* Motion */}
      <SectionTitle>Motion</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            ["--duration-fast", "160ms"],
            ["--duration-base", "320ms"],
            ["--duration-slow", "640ms"],
            ["--duration-cinema", "1200ms"],
          ] as const
        ).map(([token, value]) => (
          <div key={token} className="bg-ink-1 border border-line-1 rounded-card p-4">
            <p className="text-xs font-mono text-mute-2">{token}</p>
            <p className="text-lg font-display font-semibold text-fore-2 mt-1">
              {value}
            </p>
          </div>
        ))}
        <div className="bg-ink-1 border border-line-1 rounded-card p-4 col-span-2">
          <p className="text-xs font-mono text-mute-2">--ease-stage</p>
          <p className="text-sm font-mono text-fore-2 mt-1">
            cubic-bezier(0.16, 1, 0.3, 1)
          </p>
        </div>
        <div className="bg-ink-1 border border-line-1 rounded-card p-4 col-span-2">
          <p className="text-xs font-mono text-mute-2">--ease-snap</p>
          <p className="text-sm font-mono text-fore-2 mt-1">
            cubic-bezier(0.32, 0, 0.16, 1)
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storybook export
// ---------------------------------------------------------------------------

const meta: Meta<typeof TokenSheet> = {
  title: "Design System/Token Sheet",
  component: TokenSheet,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof TokenSheet>;

export const Default: Story = {};
