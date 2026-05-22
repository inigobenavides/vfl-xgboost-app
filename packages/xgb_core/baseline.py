from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)

# Vertical split: host holds ALL features (numeric only for simplicity), guest holds ONLY labels.
HOST_FEATURES: list[str] = [
    "age",
    "fnlwgt",
    "education-num",
    "capital-gain",
    "capital-loss",
    "hours-per-week",
]
LABEL_COL: str = "class"

_DEFAULT_CACHE = Path.home() / ".cache" / "fxgb"


def _load_adult(data_home: Path) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.int32]]:
    """Fetch UCI Adult, preprocess, and return (features, labels) as numpy arrays.

    Isolates all untyped sklearn/pandas calls so pyright strict sees typed outputs.
    """
    from sklearn.datasets import fetch_openml  # type: ignore[import-untyped]

    bunch: Any = fetch_openml(  # type: ignore[reportUnknownVariableType]
        "adult", version=2, as_frame=True, parser="auto", data_home=str(data_home)
    )
    frame: Any = bunch.frame  # type: ignore[reportUnknownVariableType]

    # 1. Drop rows with missing values.
    frame = frame.dropna()

    # 2. Encode binary label: ">50K" → 1, else 0.
    raw_labels: Any = frame[LABEL_COL].astype(str).str.strip()
    labels_np: npt.NDArray[np.int32] = np.asarray(
        (raw_labels == ">50K").to_numpy(), dtype=np.int32
    )

    # 3. Use numeric features only (host side).
    features_np: npt.NDArray[np.float64] = np.asarray(
        frame[HOST_FEATURES].to_numpy(), dtype=np.float64
    )

    return features_np, labels_np


def train_baseline(cache_dir: Path | None = None) -> float:
    """Train centralized XGBoost on UCI Adult, return test AUC.

    Downloads data on first call; caches to cache_dir (default: ~/.cache/fxgb/).
    Logs AUC to stdout.
    """
    from sklearn.metrics import roc_auc_score  # type: ignore[import-untyped]
    from sklearn.model_selection import train_test_split  # type: ignore[import-untyped]

    data_home = cache_dir if cache_dir is not None else _DEFAULT_CACHE
    data_home.mkdir(parents=True, exist_ok=True)

    features_np, labels_np = _load_adult(data_home)

    # 4. 80/20 train/test split.
    split_result: Any = train_test_split(  # type: ignore[reportUnknownVariableType]
        features_np, labels_np, test_size=0.2, random_state=42
    )
    x_train: npt.NDArray[np.float64] = np.asarray(split_result[0], dtype=np.float64)
    x_test: npt.NDArray[np.float64] = np.asarray(split_result[1], dtype=np.float64)
    y_train: npt.NDArray[np.int32] = np.asarray(split_result[2], dtype=np.int32)
    y_test: npt.NDArray[np.int32] = np.asarray(split_result[3], dtype=np.int32)

    model = XGBClassifier(
        n_estimators=100,
        max_depth=6,
        random_state=42,
        eval_metric="auc",
        verbosity=0,
    )
    model.fit(x_train, y_train)

    pred_proba: npt.NDArray[np.float64] = model.predict_proba(x_test)[:, 1]
    auc_result: Any = roc_auc_score(y_test, pred_proba)  # type: ignore[reportUnknownVariableType]
    auc: float = float(auc_result)  # type: ignore[reportUnknownArgumentType]

    print(f"Baseline XGBoost AUC: {auc:.4f}")
    logger.info("Baseline XGBoost AUC: %.4f", auc)

    return auc
