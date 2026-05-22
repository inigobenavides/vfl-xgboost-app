from __future__ import annotations

import pytest

from packages.xgb_core.baseline import train_baseline


@pytest.mark.slow
def test_baseline_auc_above_threshold() -> None:
    """Centralized XGBoost on UCI Adult numeric features should achieve AUC > 0.85."""
    auc = train_baseline()
    assert auc > 0.85, f"Expected AUC > 0.85, got {auc:.4f}"
