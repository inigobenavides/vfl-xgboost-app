"""In-process VFL XGBoost demo.

Simulates the full federated protocol using AdditiveSSProtocol directly
(no HTTP) so the smoke test runs quickly without Docker.

Guest role: holds labels, computes log-loss gradients / hessians.
Host role: holds all numeric features, computes histogram shares.
Both roles are simulated locally — shares still cross the protocol boundary.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from packages.crypto.additive_ss import AdditiveSSProtocol
from packages.party.common.binning import assign_bins, compute_bin_boundaries
from packages.party.split_finder import find_best_split
from packages.xgb_core.baseline import HOST_FEATURES

logger = logging.getLogger(__name__)

_DEFAULT_CACHE = Path.home() / ".cache" / "fxgb"

N_TREES: int = 100
MAX_DEPTH: int = 4
N_BINS: int = 64
LR: float = 0.1
LAMBDA_REG: float = 1.0
MIN_CHILD_SAMPLES: int = 10


# ---------------------------------------------------------------------------
# Tree data structure
# ---------------------------------------------------------------------------


@dataclass
class _TreeNode:
    sample_indices: npt.NDArray[np.int64]
    feature_id: str = ""
    threshold: int = 0
    leaf_weight: float = 0.0
    left: _TreeNode | None = field(default=None, repr=False)
    right: _TreeNode | None = field(default=None, repr=False)

    @property
    def is_leaf(self) -> bool:
        return self.left is None


# ---------------------------------------------------------------------------
# Math helpers
# ---------------------------------------------------------------------------


def _sigmoid(x: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp(-x))  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Protocol-level helpers (in-process simulation)
# ---------------------------------------------------------------------------


def _build_tree(
    features: npt.NDArray[np.float64],
    feature_names: list[str],
    g: npt.NDArray[np.float64],
    h: npt.NDArray[np.float64],
    all_indices: npt.NDArray[np.int64],
    max_depth: int,
    n_bins: int,
    lambda_reg: float,
    bin_boundaries: dict[str, npt.NDArray[np.float64]],
    proto: AdditiveSSProtocol,
) -> _TreeNode:
    root = _TreeNode(sample_indices=all_indices)
    queue: list[tuple[_TreeNode, int]] = [(root, 0)]

    while queue:
        node, depth = queue.pop(0)
        idx = node.sample_indices

        g_node = float(g[idx].sum())
        h_node = float(h[idx].sum())
        node.leaf_weight = -g_node / (h_node + lambda_reg)

        if depth >= max_depth or len(idx) < MIN_CHILD_SAMPLES:
            continue

        decision = find_best_split(
            proto=proto,
            g=g,
            h=h,
            sample_indices=idx,
            features=features,
            feature_names=feature_names,
            bin_boundaries=bin_boundaries,
            n_bins=n_bins,
            lambda_reg=lambda_reg,
        )
        if decision is None:
            continue

        feat_id, thresh_bin = decision.feature_id, int(decision.threshold)
        col_idx = feature_names.index(feat_id)
        col_values: npt.NDArray[np.float64] = features[idx, col_idx]
        bucket_indices = assign_bins(col_values, bin_boundaries[feat_id])
        left_mask = bucket_indices <= thresh_bin

        node.feature_id = feat_id
        node.threshold = thresh_bin
        node.left = _TreeNode(sample_indices=idx[left_mask])
        node.right = _TreeNode(sample_indices=idx[~left_mask])
        queue.append((node.left, depth + 1))
        queue.append((node.right, depth + 1))

    return root


def _predict_tree(
    node: _TreeNode,
    features: npt.NDArray[np.float64],
    feature_names: list[str],
    bin_boundaries: dict[str, npt.NDArray[np.float64]],
) -> npt.NDArray[np.float64]:
    """Return per-sample leaf weight for all samples in features."""
    n_samples = features.shape[0]
    result = np.zeros(n_samples, dtype=np.float64)

    # BFS using boolean masks so every sample reaches exactly one leaf.
    mask_all = np.ones(n_samples, dtype=bool)
    queue: list[tuple[_TreeNode, npt.NDArray[np.bool_]]] = [(node, mask_all)]

    while queue:
        cur, mask = queue.pop(0)
        if cur.is_leaf:
            result[mask] = cur.leaf_weight
            continue

        col_idx = feature_names.index(cur.feature_id)
        col_values: npt.NDArray[np.float64] = features[mask, col_idx]
        bucket_indices = assign_bins(col_values, bin_boundaries[cur.feature_id])
        goes_left = bucket_indices <= cur.threshold

        left_mask = mask.copy()
        left_mask[mask] = goes_left
        right_mask = mask.copy()
        right_mask[mask] = ~goes_left

        assert cur.left is not None and cur.right is not None  # noqa: S101
        queue.append((cur.left, left_mask))
        queue.append((cur.right, right_mask))

    return result


# ---------------------------------------------------------------------------
# Public training entry point
# ---------------------------------------------------------------------------


def run_vfl(
    x_train: npt.NDArray[np.float64],
    y_train: npt.NDArray[np.float64],
    x_test: npt.NDArray[np.float64],
    feature_names: list[str],
    n_trees: int = N_TREES,
    max_depth: int = MAX_DEPTH,
    n_bins: int = N_BINS,
    lr: float = LR,
    lambda_reg: float = LAMBDA_REG,
) -> npt.NDArray[np.float64]:
    """Train a VFL XGBoost ensemble; return test-set predicted probabilities."""
    proto = AdditiveSSProtocol()

    bin_boundaries: dict[str, npt.NDArray[np.float64]] = {
        feat: compute_bin_boundaries(x_train[:, col_idx], n_bins)
        for col_idx, feat in enumerate(feature_names)
    }

    n_train = x_train.shape[0]
    n_test = x_test.shape[0]
    train_logit = np.zeros(n_train, dtype=np.float64)
    test_logit = np.zeros(n_test, dtype=np.float64)
    all_indices = np.arange(n_train, dtype=np.int64)

    for tree_idx in range(n_trees):
        preds = _sigmoid(train_logit)
        g: npt.NDArray[np.float64] = (preds - y_train).astype(np.float64)
        h: npt.NDArray[np.float64] = (preds * (1.0 - preds)).astype(np.float64)

        tree = _build_tree(
            x_train, feature_names, g, h, all_indices,
            max_depth, n_bins, lambda_reg, bin_boundaries, proto,
        )
        train_logit += lr * _predict_tree(tree, x_train, feature_names, bin_boundaries)
        test_logit += lr * _predict_tree(tree, x_test, feature_names, bin_boundaries)

        if (tree_idx + 1) % 10 == 0:
            logger.info("Tree %d/%d done", tree_idx + 1, n_trees)

    return _sigmoid(test_logit)


def main(cache_dir: Path | None = None) -> float:
    """Load UCI Adult, train VFL XGBoost, return test AUC."""
    from sklearn.metrics import roc_auc_score  # type: ignore[import-untyped]
    from sklearn.model_selection import train_test_split  # type: ignore[import-untyped]

    from packages.xgb_core.baseline import load_adult

    data_home = cache_dir if cache_dir is not None else _DEFAULT_CACHE
    data_home.mkdir(parents=True, exist_ok=True)

    features_np, labels_np = load_adult(data_home)
    split_result: Any = train_test_split(  # type: ignore[reportUnknownVariableType]
        features_np, labels_np, test_size=0.2, random_state=42
    )
    x_train: npt.NDArray[np.float64] = np.asarray(split_result[0], dtype=np.float64)
    x_test: npt.NDArray[np.float64] = np.asarray(split_result[1], dtype=np.float64)
    y_train: npt.NDArray[np.float64] = np.asarray(split_result[2], dtype=np.float64)
    y_test: npt.NDArray[np.float64] = np.asarray(split_result[3], dtype=np.float64)

    pred_proba = run_vfl(x_train, y_train, x_test, feature_names=HOST_FEATURES)

    auc_result: Any = roc_auc_score(y_test, pred_proba)  # type: ignore[reportUnknownVariableType]
    auc: float = float(auc_result)  # type: ignore[reportUnknownArgumentType]

    print(f"VFL XGBoost AUC: {auc:.4f}")
    logger.info("VFL XGBoost AUC: %.4f", auc)
    return auc


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
