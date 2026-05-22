"""In-process VFL XGBoost demo.

Simulates the full federated protocol using AdditiveSSProtocol directly
(no HTTP) so the smoke test runs quickly without Docker.

Guest role: holds labels, computes log-loss gradients / hessians.
Host role: holds all numeric features, computes histogram shares.
Both roles are simulated locally — shares still cross the protocol boundary.

For trace-emission use cases (e.g. the canonical UI replay baked by
``scripts/bake_canonical_trace.py``), :func:`run_vfl` accepts an optional
``writer``, an optional ``y_test`` (for per-tree AUC), an optional ``now``
clock callable (for deterministic timestamps), and an optional ``rng`` (for
deterministic secret-sharing). Pass ``None`` for any of these to get the
default non-emitting behaviour used by the smoke test.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from packages.coordinator.trace import TraceWriter
from packages.crypto.additive_ss import AdditiveSSProtocol
from packages.party.common.binning import assign_bins, compute_bin_boundaries
from packages.party.split_finder import (
    SplitFinderAggregates,
    compute_gain_curve,
    find_best_split,
    find_best_split_with_aggregates,
)
from packages.shared.models import (
    AucDeltaEvent,
    GainCurveEvent,
    NodeExpandedEvent,
    PrivacyCheck,
    ProtocolMessageEvent,
    ReconstructionAggregateEvent,
    TreeStartEvent,
)
from packages.xgb_core.baseline import HOST_FEATURES

logger = logging.getLogger(__name__)

_DEFAULT_CACHE = Path.home() / ".cache" / "fxgb"

N_TREES: int = 100
MAX_DEPTH: int = 4
N_BINS: int = 64
LR: float = 0.1
LAMBDA_REG: float = 1.0
MIN_CHILD_SAMPLES: int = 10

ClockFn = Callable[[], datetime]


# ---------------------------------------------------------------------------
# Tree data structure
# ---------------------------------------------------------------------------


@dataclass
class _TreeNode:
    sample_indices: npt.NDArray[np.int64]
    node_id: str = ""
    parent_id: str | None = None
    depth: int = 0
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


def _cumulative_to_per_bucket(
    cumulative: npt.NDArray[np.float64],
) -> list[float]:
    """Convert a cumulative histogram back into per-bucket values."""
    if len(cumulative) == 0:
        return []
    per_bucket: list[float] = [float(cumulative[0])]
    for k in range(1, len(cumulative)):
        per_bucket.append(float(cumulative[k] - cumulative[k - 1]))
    return per_bucket


def _wall_clock() -> datetime:
    return datetime.now(tz=UTC)


# ---------------------------------------------------------------------------
# Trace-emission helpers (no-op when writer is None)
# ---------------------------------------------------------------------------


def _emit_protocol_round_trip(
    writer: TraceWriter,
    now: ClockFn,
    node_id: str,
    n_samples_at_node: int,
    n_features: int,
    n_bins: int,
) -> None:
    """Synthesize the 4-step coordinator/party traffic for one tree node.

    In-process training has no real HTTP coordinator, but the UI's act-1
    "message wire" animations key off ``ProtocolMessageEvent`` records.
    These events capture only metadata — shape, dtype, party, step — never
    payload digits, so the privacy invariant still holds.
    """
    privacy = PrivacyCheck()
    for step, payload_type, from_party, to_party, payload_shape in [
        (1, "GradientShareResponse", "coordinator", "guest", (n_samples_at_node,)),
        (2, "HistogramShareResponse", "coordinator", "host", (n_features, n_bins)),
        (3, "SplitDecision", "coordinator", "guest", (1,)),
        (4, "ApplySplitRequest", "coordinator", "guest+host", (2,)),
    ]:
        writer.append(
            ProtocolMessageEvent(
                step=step,
                node_id=node_id,
                from_party=from_party,
                to_party=to_party,
                payload_type=payload_type,
                payload_shape=payload_shape,
                timestamp=now(),
                privacy_check=privacy,
            )
        )


def _emit_canonical_aggregates(
    writer: TraceWriter,
    now: ClockFn,
    tree_index: int,
    node_id: str,
    chosen_feature_id: str,
    aggregates: SplitFinderAggregates,
    n_bins: int,
    lambda_reg: float,
) -> None:
    """Emit GainCurve + ReconstructionAggregate for the canonical reconstruction node.

    Only called for tree 0's root. The reconstruction aggregate is emitted for the
    chosen feature; the gain curve covers all features. The histogram values are
    per-bucket (not cumulative) so the UI can render bars directly.
    """
    writer.append(
        GainCurveEvent(
            tree_index=tree_index,
            node_id=node_id,
            per_feature=compute_gain_curve(
                aggregates.g_hists, aggregates.h_hists, n_bins, lambda_reg
            ),
            timestamp=now(),
        )
    )
    writer.append(
        ReconstructionAggregateEvent(
            tree_index=tree_index,
            node_id=node_id,
            feature_id=chosen_feature_id,
            g_per_bucket=_cumulative_to_per_bucket(aggregates.g_hists[chosen_feature_id]),
            h_per_bucket=_cumulative_to_per_bucket(aggregates.h_hists[chosen_feature_id]),
            timestamp=now(),
        )
    )


# ---------------------------------------------------------------------------
# Tree building
# ---------------------------------------------------------------------------


def _build_tree(
    tree_index: int,
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
    writer: TraceWriter | None,
    now: ClockFn,
) -> _TreeNode:
    """Build one tree, optionally emitting trace events as it grows."""
    root = _TreeNode(
        sample_indices=all_indices,
        node_id=f"t{tree_index}/n0",
        parent_id=None,
        depth=0,
    )
    next_id = 1

    if writer is not None:
        writer.append(
            TreeStartEvent(
                tree_index=tree_index,
                n_samples=int(len(all_indices)),
                timestamp=now(),
            )
        )

    queue: list[_TreeNode] = [root]

    while queue:
        node = queue.pop(0)
        depth = node.depth
        idx = node.sample_indices

        g_node = float(g[idx].sum())
        h_node = float(h[idx].sum())
        node.leaf_weight = -g_node / (h_node + lambda_reg)

        # Synthesize the 4-step protocol round-trip for act-1 wire animations.
        # Only emit for tree 0 — trees 1-99 appear as thumbnails in the act-2
        # montage and don't need per-node wire activity.
        if writer is not None and tree_index == 0:
            _emit_protocol_round_trip(
                writer=writer,
                now=now,
                node_id=node.node_id,
                n_samples_at_node=int(len(idx)),
                n_features=len(feature_names),
                n_bins=n_bins,
            )

        is_canonical = tree_index == 0 and depth == 0

        if depth >= max_depth or len(idx) < MIN_CHILD_SAMPLES:
            # Reached max depth or too few samples — leaf.
            if writer is not None:
                writer.append(
                    NodeExpandedEvent(
                        tree_index=tree_index,
                        node_id=node.node_id,
                        parent_id=node.parent_id,
                        depth=depth,
                        n_samples=int(len(idx)),
                        samples_l=0,
                        samples_r=0,
                        feature_id=None,
                        threshold_bin=None,
                        gain=None,
                        leaf_weight=node.leaf_weight,
                        is_leaf=True,
                        timestamp=now(),
                    )
                )
            continue

        aggregates: SplitFinderAggregates | None = None
        if is_canonical:
            decision, aggregates = find_best_split_with_aggregates(
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
        else:
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
            # No positive-gain split — treat as leaf.
            if writer is not None:
                writer.append(
                    NodeExpandedEvent(
                        tree_index=tree_index,
                        node_id=node.node_id,
                        parent_id=node.parent_id,
                        depth=depth,
                        n_samples=int(len(idx)),
                        samples_l=0,
                        samples_r=0,
                        feature_id=None,
                        threshold_bin=None,
                        gain=None,
                        leaf_weight=node.leaf_weight,
                        is_leaf=True,
                        timestamp=now(),
                    )
                )
            continue

        feat_id = decision.feature_id
        thresh_bin = int(decision.threshold)
        col_idx = feature_names.index(feat_id)
        col_values: npt.NDArray[np.float64] = features[idx, col_idx]
        bucket_indices = assign_bins(col_values, bin_boundaries[feat_id])
        left_mask = bucket_indices <= thresh_bin

        node.feature_id = feat_id
        node.threshold = thresh_bin
        left_id = f"t{tree_index}/n{next_id}"
        next_id += 1
        right_id = f"t{tree_index}/n{next_id}"
        next_id += 1
        node.left = _TreeNode(
            sample_indices=idx[left_mask],
            node_id=left_id,
            parent_id=node.node_id,
            depth=depth + 1,
        )
        node.right = _TreeNode(
            sample_indices=idx[~left_mask],
            node_id=right_id,
            parent_id=node.node_id,
            depth=depth + 1,
        )

        if writer is not None:
            writer.append(
                NodeExpandedEvent(
                    tree_index=tree_index,
                    node_id=node.node_id,
                    parent_id=node.parent_id,
                    depth=depth,
                    n_samples=int(len(idx)),
                    samples_l=int(left_mask.sum()),
                    samples_r=int((~left_mask).sum()),
                    feature_id=feat_id,
                    threshold_bin=thresh_bin,
                    gain=float(decision.gain),
                    leaf_weight=None,
                    is_leaf=False,
                    timestamp=now(),
                )
            )

            if is_canonical and aggregates is not None:
                _emit_canonical_aggregates(
                    writer=writer,
                    now=now,
                    tree_index=tree_index,
                    node_id=node.node_id,
                    chosen_feature_id=feat_id,
                    aggregates=aggregates,
                    n_bins=n_bins,
                    lambda_reg=lambda_reg,
                )

        queue.append(node.left)
        queue.append(node.right)

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
    y_test: npt.NDArray[np.float64] | None = None,
    writer: TraceWriter | None = None,
    now: ClockFn | None = None,
    rng: np.random.Generator | None = None,
) -> npt.NDArray[np.float64]:
    """Train a VFL XGBoost ensemble; return test-set predicted probabilities.

    Optional ``writer`` enables trace emission. When set, also pass ``y_test``
    to emit per-tree AUC events, and ``now``/``rng`` for deterministic output.
    """
    now_fn: ClockFn = now if now is not None else _wall_clock
    proto = AdditiveSSProtocol(rng=rng) if rng is not None else AdditiveSSProtocol()

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
            tree_index=tree_idx,
            features=x_train,
            feature_names=feature_names,
            g=g,
            h=h,
            all_indices=all_indices,
            max_depth=max_depth,
            n_bins=n_bins,
            lambda_reg=lambda_reg,
            bin_boundaries=bin_boundaries,
            proto=proto,
            writer=writer,
            now=now_fn,
        )
        train_logit += lr * _predict_tree(tree, x_train, feature_names, bin_boundaries)
        test_logit += lr * _predict_tree(tree, x_test, feature_names, bin_boundaries)

        if writer is not None and y_test is not None:
            from sklearn.metrics import roc_auc_score  # type: ignore[import-untyped]

            test_proba = _sigmoid(test_logit)
            auc_result: Any = roc_auc_score(y_test, test_proba)  # type: ignore[reportUnknownVariableType]
            writer.append(
                AucDeltaEvent(
                    tree_index=tree_idx,
                    auc=float(auc_result),  # type: ignore[reportUnknownArgumentType]
                    timestamp=now_fn(),
                )
            )

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
