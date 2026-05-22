"""Guest party route handlers.

The guest holds the labels and computes log-loss gradients/hessians.
It secret-shares them using AdditiveSSProtocol and participates in
the split-finding protocol by reconstructing histograms from host shares.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import numpy.typing as npt
from fastapi import APIRouter, HTTPException

from packages.crypto import AdditiveSSProtocol
from packages.shared.models import (
    ApplySplitRequest,
    FindSplitRequest,
    GradientShareRequest,
    GradientShareResponse,
    Share,
    SplitDecision,
)


@dataclass
class NodeState:
    """In-memory state per tree node, cleared after apply_split."""

    g_share_b: npt.NDArray[np.int64]
    h_share_b: npt.NDArray[np.int64]
    sample_indices: list[int] = field(default_factory=list[int])


def make_guest_router(
    labels: npt.NDArray[np.float64],
    predictions: npt.NDArray[np.float64],
    lambda_reg: float,
) -> tuple[APIRouter, dict[str, NodeState]]:
    """Return (router, node_state_dict).

    The node_state_dict is mutable and shared between requests so callers
    can inspect it in tests.
    """
    router = APIRouter()
    _node_state: dict[str, NodeState] = {}
    _proto = AdditiveSSProtocol()

    # Wrap mutable predictions so the closure sees updates
    _preds = predictions.copy()

    @router.post("/gradient_shares", response_model=GradientShareResponse)
    def gradient_shares(req: GradientShareRequest) -> GradientShareResponse:  # pyright: ignore[reportUnusedFunction]
        indices = np.array(req.sample_indices, dtype=np.intp)
        if len(indices) == 0:
            raise HTTPException(status_code=422, detail="sample_indices must not be empty")

        preds_i: npt.NDArray[np.float64] = _preds[indices]
        labels_i: npt.NDArray[np.float64] = labels[indices]

        # Log-loss gradients / hessians
        g: npt.NDArray[np.float64] = (preds_i - labels_i).astype(np.float64)
        h: npt.NDArray[np.float64] = (preds_i * (1.0 - preds_i)).astype(np.float64)

        g_share_a, g_share_b = _proto.share(g)
        h_share_a, h_share_b = _proto.share(h)

        _node_state[req.node_id] = NodeState(
            g_share_b=g_share_b,
            h_share_b=h_share_b,
            sample_indices=list(req.sample_indices),
        )

        return GradientShareResponse(
            g_share_a=Share.from_array(g_share_a),
            h_share_a=Share.from_array(h_share_a),
        )

    @router.post("/find_split", response_model=SplitDecision)
    def find_split(req: FindSplitRequest) -> SplitDecision:  # pyright: ignore[reportUnusedFunction]
        state = _node_state.get(req.node_id)
        if state is None:
            raise HTTPException(
                status_code=404,
                detail=f"No state for node_id={req.node_id!r}. Call /gradient_shares first.",
            )
        if not req.host_feature_shares:
            raise HTTPException(status_code=422, detail="host_feature_shares must not be empty")

        best_gain = -float("inf")
        best_feature_id = ""
        best_threshold = 0.0

        for feature_id, feat_shares in req.host_feature_shares.items():
            bucket_indices_list = req.bucket_indices_per_feature.get(feature_id)
            if bucket_indices_list is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"bucket_indices_per_feature missing feature {feature_id!r}",
                )
            bucket_indices = np.array(bucket_indices_list, dtype=np.int64)

            # Aggregate guest's share_b over the same bucket structure as the host
            g_hist_b = _proto.aggregate(state.g_share_b, bucket_indices, req.n_buckets)
            h_hist_b = _proto.aggregate(state.h_share_b, bucket_indices, req.n_buckets)

            # Host sent cumulative histogram shares (share_a side)
            host_g_hist_a: npt.NDArray[np.int64] = feat_shares.g_share.to_array().astype(
                np.int64
            )
            host_h_hist_a: npt.NDArray[np.int64] = feat_shares.h_share.to_array().astype(
                np.int64
            )

            # Reconstruct full cumulative histograms
            g_hist = _proto.reconstruct(host_g_hist_a, g_hist_b)
            h_hist = _proto.reconstruct(host_h_hist_a, h_hist_b)

            g_total = float(g_hist[-1])
            h_total = float(h_hist[-1])

            # Scan thresholds (each bin boundary k splits [0..k] vs [k+1..n_buckets-1])
            for k in range(req.n_buckets - 1):
                g_left = float(g_hist[k])
                h_left = float(h_hist[k])
                g_right = g_total - g_left
                h_right = h_total - h_left

                gain = (
                    g_left**2 / (h_left + lambda_reg)
                    + g_right**2 / (h_right + lambda_reg)
                    - g_total**2 / (h_total + lambda_reg)
                )
                if gain > best_gain:
                    best_gain = gain
                    best_feature_id = feature_id
                    best_threshold = float(k)

        return SplitDecision(
            feature_id=best_feature_id,
            threshold=best_threshold,
            gain=max(best_gain, 0.0),
        )

    @router.post("/apply_split")
    def apply_split(req: ApplySplitRequest) -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        _node_state.pop(req.node_id, None)
        return {}

    @router.get("/health")
    def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    return router, _node_state
