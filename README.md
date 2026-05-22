# Federated XGBoost Playground

A teaching-grade, portfolio-worthy implementation of **vertical federated XGBoost** with a pluggable privacy backend. Train gradient-boosted trees across multiple parties without anyone seeing each other's raw features.

## Why this exists

- Demystify federated learning for fintech ML problems where parties hold complementary features about shared users.
- Provide a clean, well-tested reference for vertical FL + secret-sharing-based split finding.
- Compare federated vs centralized training on accuracy, training time, and information leakage.

## Status

Pre-MVP. See `docs/adr/0001-architecture.md` for current direction and `CLAUDE.md` for working notes.

## Quick start

```bash
uv sync
uv run pytest
# (more once services exist)
```

## Architecture

See `docs/CONTEXT.md` for the domain primer and `docs/adr/` for architectural decisions.

## License

Personal project. Not for deployment against real PII or financial data.
