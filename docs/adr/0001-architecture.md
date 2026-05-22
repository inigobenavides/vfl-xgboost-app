# ADR-0001: Vertical Federated XGBoost with Additive Secret Sharing

**Date:** 2026-05-22
**Status:** Accepted

## Context

We are building a teaching-grade federated XGBoost playground. The two big architectural forks are:

1. Vertical vs horizontal federation.
2. Privacy primitive: additive secret sharing vs Paillier homomorphic encryption (HE) vs hybrid.

## Decision

- **Federation mode:** vertical. Better fit for the target fintech use cases (parties hold complementary features for shared users) and more interesting cryptographically than horizontal.
- **Privacy primitive (MVP):** additive secret sharing over a large prime field. Built from scratch for the learning value.
- **Pluggable interface:** all crypto operations route through a `crypto.Protocol` interface. A future ADR will introduce a Paillier HE backend behind the same interface.
- **Threat model:** honest-but-curious only.
- **Parties (MVP):** exactly 2 — one guest (labels) and one host. Multi-party (3+) is future work.
- **Dataset(s) for MVP:** UCI Adult (income binary classification) and, if time permits, Kaggle Credit Card Fraud. Both public, both vertical-splittable in a defensible way.

## Consequences

- `xgb_core` must never import concrete crypto primitives — only the `Protocol` abstraction.
- Performance comparisons always include a centralized XGBoost baseline (sklearn or `xgboost` library).
- We give up some "industrial credibility" by not starting with Paillier HE, but gain pedagogical clarity. Mitigated by the planned HE backend.
- All datasets are public or synthetic; no real fintech data lands in this repo, ever.
- The protocol trace is a first-class artifact: each FL run produces a JSON trace that demonstrates no raw gradients or features crossed the wire in cleartext.

## Alternatives considered

- **Paillier HE first.** Closer to the SecureBoost paper and more recognizable to fintech ML readers, but heavier dependency surface, slower iteration, and using an existing HE library teaches less about the underlying privacy guarantee.
- **Horizontal federation first.** Simpler in some respects (FedAvg-style on tree statistics) but less interesting for the stated use case and less educational about the harder cryptographic primitives.
- **Use Flower or FATE directly.** Misses the point — the goal is to *understand* the protocol by building it, not to orchestrate someone else's.
