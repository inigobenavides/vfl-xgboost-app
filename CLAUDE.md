# CLAUDE.md — Federated XGBoost Playground

This file is the runbook for any Claude Code session in this repo. Read it first.

## Mission

Build a teaching-grade, portfolio-worthy **vertical federated XGBoost** implementation with a pluggable privacy backend. Optimized for clarity, testability, and demonstrability over raw performance.

## Non-goals

- Production security audit or deployment.
- Cross-organization or wide-area-network operation.
- Massive scale (>10M rows).
- Real PII or financial data ever lands in this repo.

## Domain language

Use these terms consistently in code, tests, and docs.

- **Party**: a federated participant holding a subset of features for a shared set of users.
- **Guest**: the party holding the labels (and therefore gradients/hessians).
- **Host**: a party holding non-label features only.
- **Coordinator**: orchestrator driving the training protocol; in our threat model, sees only secret-shared values.
- **Vertical federation**: parties share users but hold different features. (Our default.)
- **Horizontal federation**: parties share features but hold different users. (Future.)
- **Split-finding**: at each tree node, find the (feature, threshold) pair that minimizes loss. The crypto-hard part of vertical FL.
- **Gradient / Hessian (g, h)**: first and second derivatives of the loss per sample; owned by the guest.
- **Additive secret sharing (ASS)**: a value `x` is split into shares `(x1, x2)` such that `x1 + x2 ≡ x (mod p)`; neither party can recover `x` alone.

## Architecture

```
                    Web UI (deferred)
                          │
                          ▼
                    Coordinator (FastAPI)
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
        Party A (Guest)           Party B (Host)
        labels + (g, h)           feature subset
              │                        │
              └─────────► crypto ◄─────┘
                     (Protocol iface:
                  additive SS today,
                  Paillier HE later)
```

Planned package layout (will evolve):

- `packages/crypto/` — additive secret sharing primitives. Pure, deterministic, property-tested.
- `packages/xgb_core/` — single-machine XGBoost reference impl for baselines and protocol comparison.
- `packages/party/` — FastAPI service for one party; exposes histogram endpoints.
- `packages/coordinator/` — orchestrates protocol round trips.
- `packages/shared/` — Pydantic schemas, IDs, common types.
- `apps/ui/` — frontend (after backend is solid).

## Tech stack

- Python 3.12, **uv** for env and dependency management.
- **ruff** + **pyright strict** for lint and types.
- **FastAPI** per service; **Pydantic v2** for schemas at all boundaries.
- **pytest** for tests; **hypothesis** for crypto property tests.
- **Docker Compose** for the 2-party local setup.
- Frontend stack TBD; defer until backend protocol is end-to-end.

## Conventions (non-negotiable)

1. **Test first for crypto.** Anything under `packages/crypto/` ships with property tests against the math before integration.
2. **ADRs for architectural forks.** Any decision affecting multiple modules gets an ADR under `docs/adr/`.
3. **Domain words win.** If a function does "histogram aggregation," call it that — not `merge_data`.
4. **Privacy backend is pluggable.** All crypto operations route through the `crypto.Protocol` interface. `xgb_core` MUST NOT import concrete primitives.
5. **No real PII.** Only public/synthetic datasets (UCI Adult, Credit Card Fraud, synthetic Pareto-tailed transaction sims).
6. **Honest-but-curious threat model** is assumed and explicit. Malicious-party defenses are out of scope for MVP.
7. **Every protocol round trip is logged** at a level that makes the trace inspectable for demos.

## Common commands

```bash
uv sync                          # install deps
uv run pytest                    # all tests
uv run ruff check .              # lint
uv run pyright                   # types
docker compose up                # 2-party local
uv run python -m fxgb.demo       # end-to-end demo on sample data
```

UI-side (run from `apps/ui/`):

```bash
npm test                         # vitest unit tests
npm run test:visual              # Playwright visual regression vs. committed
                                 # baselines — Linux/CI only (per ADR 0002)
npm run test:visual:linux        # same suite, via the pinned Playwright Docker
                                 # image — use this from macOS/Windows to verify
                                 # against the canonical Linux baselines
npm run baseline:linux           # regen *-chromium-linux.png baselines via the
                                 # same Docker image (after a visual change,
                                 # before pushing the PR)
```

## MVP definition of done

Vertical federation of 2 parties trains an XGBoost model on UCI Adult, achieves AUC within 0.02 of a centralized baseline, with all gradient/hessian exchanges secret-shared and a protocol trace showing no party learned the other's raw features. CLI demo first; UI second.

## Session protocol

When opening a session:

1. Read this file and `docs/CONTEXT.md`.
2. Check the latest ADRs in `docs/adr/`.
3. Look at open TODOs (`grep -r TODO packages/` or ask).
4. **Propose a plan before writing code** on anything non-trivial. If the change touches a module boundary, draft (or update) an ADR first.

## What "good" looks like for a PR

- One ADR if architectural; otherwise a clear commit message referencing the relevant ADR.
- New code has tests at the same commit.
- `ruff` and `pyright` clean.
- If protocol-touching: a trace artifact (JSON) attached showing the round trips.
