/**
 * tooltips.ts — canonical copy for the six glossary tooltips.
 *
 * Imported by anchors across components so the wording stays in one place.
 * Tone was set via /grill-me: Guest/Host as characters, plain English,
 * 15–25 words each.
 */

export const TOOLTIPS = {
  cryptoShare:
    "A cryptographic share — a piece of a number, useless alone. Only meaningful when both parties combine their pieces.",
  gradients:
    "How wrong the model is on each sample. The Guest computes these from its private labels — and never shows them raw.",
  hessians:
    "How confident the gradient is. Together with the gradient, this tells the tree where to split.",
  auc:
    "Area under the ROC curve — a 0-to-1 score of model quality. 0.5 is coin-flip; 1.0 is perfect.",
  reconstruction:
    "Combining the parties' shares to recover the gradient sum used to find the split — the only moment shared signal becomes meaningful.",
  leafWeight:
    "A leaf's contribution to the final score for samples that reach it. Higher = stronger positive vote.",
} as const;
