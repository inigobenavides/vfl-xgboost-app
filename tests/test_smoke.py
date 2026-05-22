"""End-to-end VFL smoke test.

Trains the in-process VFL XGBoost demo on UCI Adult and asserts that
the test-set AUC is within 0.02 of the centralized baseline (≥ 0.847).

Mark: slow — downloads UCI Adult (~5 MB) on first run, then trains 50 trees.
"""

from __future__ import annotations

import pytest

AUC_FLOOR = 0.847


@pytest.mark.slow
def test_vfl_auc_within_tolerance() -> None:
    from fxgb.demo import main

    auc = main()
    assert auc >= AUC_FLOOR, f"VFL AUC {auc:.4f} < {AUC_FLOOR} floor"
