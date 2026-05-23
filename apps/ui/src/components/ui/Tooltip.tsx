/**
 * Tooltip — thin wrapper around @radix-ui/react-tooltip styled with the
 * project's design tokens. Plus a JargonTerm helper that renders a span
 * with the dotted-underline jargon affordance and wires the tooltip
 * trigger automatically.
 *
 * Usage:
 *   <JargonTerm content="A crypto share is …">crypto shares</JargonTerm>
 *
 * Or, for a custom trigger:
 *   <Tooltip content="…">
 *     <button>…</button>
 *   </Tooltip>
 */

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Tooltip — wraps any element as the trigger
// ---------------------------------------------------------------------------

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={12}
            className="z-[100] max-w-[280px] bg-ink-2 border border-line-1 rounded-card shadow-card text-fore-1 text-xs font-sans px-3 py-2 leading-snug"
          >
            {content}
            <RadixTooltip.Arrow className="fill-ink-2" width={10} height={5} />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// JargonTerm — convenience for inline glossary terms in copy
// ---------------------------------------------------------------------------

interface JargonTermProps {
  content: ReactNode;
  children: ReactNode;
  /** Override the underline colour (defaults to mute-1). */
  className?: string;
}

export function JargonTerm({ content, children, className = "" }: JargonTermProps) {
  return (
    <Tooltip content={content}>
      <span
        tabIndex={0}
        className={`cursor-help underline decoration-mute-1 decoration-dotted decoration-1 underline-offset-[3px] focus:outline-none focus-visible:decoration-fore-1 hover:decoration-fore-1 transition-colors ${className}`}
      >
        {children}
      </span>
    </Tooltip>
  );
}
