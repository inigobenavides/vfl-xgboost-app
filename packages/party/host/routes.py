from __future__ import annotations

import numpy as np
import numpy.typing as npt
from fastapi import APIRouter, Request

from packages.crypto import AdditiveSSProtocol
from packages.party.common.binning import assign_bins
from packages.party.host.state import HostState
from packages.shared.models import (
    ApplySplitRequest,
    FeatureHistogramShares,
    HistogramShareRequest,
    HistogramShareResponse,
    Share,
)

router = APIRouter()

_proto = AdditiveSSProtocol()


def _get_state(request: Request) -> HostState:
    state: HostState = request.app.state.host_state
    return state


@router.post("/histogram_shares", response_model=HistogramShareResponse)
def histogram_shares(
    body: HistogramShareRequest,
    request: Request,
) -> HistogramShareResponse:
    """Compute per-feature cumulative histogram shares for g and h.

    The host never sees raw gradient values — it receives additive shares
    and aggregates them into bin-level histogram shares.
    """
    state = _get_state(request)
    features: npt.NDArray[np.float64] = state.features
    feature_names: list[str] = state.feature_names
    bin_boundaries: dict[str, npt.NDArray[np.float64]] = state.bin_boundaries
    n_bins: int = state.n_bins
    node_partitions: dict[str, npt.NDArray[np.int64]] = state.node_partitions

    sample_indices = np.array(body.sample_indices, dtype=np.int64)

    g_share_a: npt.NDArray[np.int64] = body.g_share_a.to_array().astype(np.int64)
    h_share_a: npt.NDArray[np.int64] = body.h_share_a.to_array().astype(np.int64)

    feature_shares: dict[str, FeatureHistogramShares] = {}
    bucket_indices_per_feature: dict[str, list[int]] = {}

    for col_idx, feat_name in enumerate(feature_names):
        col: npt.NDArray[np.float64] = features[sample_indices, col_idx]
        boundaries = bin_boundaries[feat_name]
        bucket_indices: npt.NDArray[np.int64] = assign_bins(col, boundaries)

        g_hist_share: npt.NDArray[np.int64] = _proto.aggregate(g_share_a, bucket_indices, n_bins)
        h_hist_share: npt.NDArray[np.int64] = _proto.aggregate(h_share_a, bucket_indices, n_bins)

        feature_shares[feat_name] = FeatureHistogramShares(
            g_share=Share.from_array(g_hist_share),
            h_share=Share.from_array(h_hist_share),
        )
        bucket_indices_per_feature[feat_name] = bucket_indices.tolist()

    # Store the partition for this node so /apply_split can update it later.
    node_partitions[body.node_id] = sample_indices

    return HistogramShareResponse(
        feature_shares=feature_shares,
        bucket_indices_per_feature=bucket_indices_per_feature,
        n_buckets=n_bins,
    )


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/apply_split")
def apply_split(
    body: ApplySplitRequest,
    request: Request,
) -> dict[str, object]:
    """Partition samples for left/right child based on the chosen split.

    body.threshold is the bin index (0..n_bins-1), not a raw feature value.
    The host maps samples to bins and splits on bin index <= threshold.
    """
    state = _get_state(request)
    features: npt.NDArray[np.float64] = state.features
    feature_names: list[str] = state.feature_names
    bin_boundaries: dict[str, npt.NDArray[np.float64]] = state.bin_boundaries
    node_partitions: dict[str, npt.NDArray[np.int64]] = state.node_partitions

    col_idx = feature_names.index(body.feature_id)
    threshold_bin = int(body.threshold)

    parent_indices = node_partitions.get(body.node_id, np.arange(features.shape[0], dtype=np.int64))
    col_values: npt.NDArray[np.float64] = features[parent_indices, col_idx]
    bucket_indices = assign_bins(col_values, bin_boundaries[body.feature_id])

    left_mask = bucket_indices <= threshold_bin
    left_indices: npt.NDArray[np.int64] = parent_indices[left_mask]
    right_indices: npt.NDArray[np.int64] = parent_indices[~left_mask]

    node_partitions[f"{body.node_id}_left"] = left_indices
    node_partitions[f"{body.node_id}_right"] = right_indices
    node_partitions.pop(body.node_id, None)

    return {}
