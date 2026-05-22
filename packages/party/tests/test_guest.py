"""Tests for the guest party FastAPI service.

Uses TestClient (synchronous) with 20 samples and 2 host features, 8 bins.
The host's role (computing histogram shares) is simulated inline so we can
drive the full gradient_shares → find_split → apply_split protocol round.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from packages.crypto import AdditiveSSProtocol
from packages.party.guest.app import create_guest_app
from packages.shared.models import (
    ApplySplitRequest,
    FeatureHistogramShares,
    FindSplitRequest,
    GradientShareRequest,
    GradientShareResponse,
    Share,
    SplitDecision,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

N_SAMPLES = 20
N_BINS = 8
RNG_SEED = 42

_JSON_HEADERS = {"content-type": "application/json"}


def _post(client: TestClient, url: str, body: BaseModel) -> Any:
    """POST a Pydantic model as JSON-encoded body with correct content-type."""
    return client.post(url, content=body.model_dump_json(), headers=_JSON_HEADERS)


@pytest.fixture()
def rng() -> np.random.Generator:
    return np.random.default_rng(RNG_SEED)


@pytest.fixture()
def labels(rng: np.random.Generator) -> npt.NDArray[np.float64]:
    return rng.integers(0, 2, size=N_SAMPLES).astype(np.float64)


@pytest.fixture()
def client(labels: npt.NDArray[np.float64]) -> TestClient:
    app = create_guest_app(labels=labels, n_bins=N_BINS, lambda_reg=1.0)
    return TestClient(app)


@pytest.fixture()
def feature_data(rng: np.random.Generator) -> dict[str, npt.NDArray[np.float64]]:
    """Two synthetic host features."""
    return {
        "f0": rng.standard_normal(N_SAMPLES).astype(np.float64),
        "f1": rng.standard_normal(N_SAMPLES).astype(np.float64),
    }


@pytest.fixture()
def sample_indices() -> list[int]:
    return list(range(N_SAMPLES))


def _make_bucket_indices(
    feature_col: npt.NDArray[np.float64], n_bins: int
) -> npt.NDArray[np.int64]:
    """Assign each sample to a bin index in [0, n_bins-1]."""
    boundaries = np.percentile(feature_col, np.linspace(0.0, 100.0, n_bins + 1))
    indices = np.digitize(feature_col, boundaries[1:-1]).astype(np.int64)
    return np.clip(indices, 0, n_bins - 1).astype(np.int64)


# ---------------------------------------------------------------------------
# Helper: simulate host computing histogram shares given guest's share_a
# ---------------------------------------------------------------------------


def _simulate_host_histogram_shares(
    g_share_a: npt.NDArray[np.int64],
    h_share_a: npt.NDArray[np.int64],
    feature_data: dict[str, npt.NDArray[np.float64]],
    sample_indices: list[int],
    n_bins: int,
) -> tuple[dict[str, FeatureHistogramShares], dict[str, list[int]]]:
    """Return (feature_shares, bucket_indices_per_feature) as the host would compute."""
    proto = AdditiveSSProtocol()
    feature_shares: dict[str, FeatureHistogramShares] = {}
    bucket_indices_per_feature: dict[str, list[int]] = {}

    idx = np.array(sample_indices, dtype=np.intp)

    for feat_id, feat_col in feature_data.items():
        bucket_idx = _make_bucket_indices(feat_col[idx], n_bins)
        g_hist_a = proto.aggregate(g_share_a, bucket_idx, n_bins)
        h_hist_a = proto.aggregate(h_share_a, bucket_idx, n_bins)
        feature_shares[feat_id] = FeatureHistogramShares(
            g_share=Share.from_array(g_hist_a),
            h_share=Share.from_array(h_hist_a),
        )
        bucket_indices_per_feature[feat_id] = bucket_idx.tolist()

    return feature_shares, bucket_indices_per_feature


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGradientShares:
    def test_returns_g_and_h_share_a_with_correct_shape(
        self, client: TestClient, sample_indices: list[int]
    ) -> None:
        req = GradientShareRequest(node_id="node_0", sample_indices=sample_indices)
        resp = _post(client, "/gradient_shares", req)

        assert resp.status_code == 200, resp.text
        body = GradientShareResponse.model_validate_json(resp.text)

        g_arr = body.g_share_a.to_array()
        h_arr = body.h_share_a.to_array()

        assert g_arr.shape == (N_SAMPLES,), f"Expected ({N_SAMPLES},), got {g_arr.shape}"
        assert h_arr.shape == (N_SAMPLES,), f"Expected ({N_SAMPLES},), got {h_arr.shape}"

    def test_shares_are_int64(
        self, client: TestClient, sample_indices: list[int]
    ) -> None:
        req = GradientShareRequest(node_id="node_0", sample_indices=sample_indices)
        resp = _post(client, "/gradient_shares", req)
        assert resp.status_code == 200, resp.text

        body = GradientShareResponse.model_validate_json(resp.text)
        assert body.g_share_a.dtype == "int64"
        assert body.h_share_a.dtype == "int64"

    def test_different_nodes_store_separate_state(
        self, client: TestClient, sample_indices: list[int]
    ) -> None:
        for node_id in ("node_A", "node_B"):
            req = GradientShareRequest(node_id=node_id, sample_indices=sample_indices)
            resp = _post(client, "/gradient_shares", req)
            assert resp.status_code == 200, resp.text

    def test_subset_of_samples(self, client: TestClient) -> None:
        subset = list(range(5))
        req = GradientShareRequest(node_id="node_sub", sample_indices=subset)
        resp = _post(client, "/gradient_shares", req)
        assert resp.status_code == 200
        body = GradientShareResponse.model_validate_json(resp.text)
        assert body.g_share_a.to_array().shape == (5,)


class TestFindSplit:
    def test_returns_valid_split_decision(
        self,
        client: TestClient,
        feature_data: dict[str, npt.NDArray[np.float64]],
        sample_indices: list[int],
    ) -> None:
        # Step 1: get gradient shares
        grad_req = GradientShareRequest(node_id="node_0", sample_indices=sample_indices)
        grad_resp_raw = _post(client, "/gradient_shares", grad_req)
        assert grad_resp_raw.status_code == 200, grad_resp_raw.text
        grad_resp = GradientShareResponse.model_validate_json(grad_resp_raw.text)

        # Step 2: simulate host computing histogram shares
        g_share_a = grad_resp.g_share_a.to_array().astype(np.int64)
        h_share_a = grad_resp.h_share_a.to_array().astype(np.int64)
        host_feature_shares, bucket_indices_per_feature = _simulate_host_histogram_shares(
            g_share_a=g_share_a,
            h_share_a=h_share_a,
            feature_data=feature_data,
            sample_indices=sample_indices,
            n_bins=N_BINS,
        )

        # Step 3: send find_split request
        find_req = FindSplitRequest(
            node_id="node_0",
            host_feature_shares=host_feature_shares,
            bucket_indices_per_feature=bucket_indices_per_feature,
            n_buckets=N_BINS,
        )
        find_resp = _post(client, "/find_split", find_req)
        assert find_resp.status_code == 200, find_resp.text

        decision = SplitDecision.model_validate_json(find_resp.text)
        assert decision.feature_id in feature_data, (
            f"feature_id {decision.feature_id!r} not in {list(feature_data.keys())}"
        )
        assert decision.gain >= 0.0, f"gain should be non-negative, got {decision.gain}"
        assert 0.0 <= decision.threshold < N_BINS, (
            f"threshold (bin index) should be in [0, {N_BINS}), got {decision.threshold}"
        )

    def test_find_split_without_prior_gradient_shares_returns_404(
        self,
        client: TestClient,
        feature_data: dict[str, npt.NDArray[np.float64]],
        sample_indices: list[int],
    ) -> None:
        # Build a plausible but fake host_feature_shares (just using zeros)
        fake_hist = np.zeros(N_BINS, dtype=np.int64)
        fake_share = Share.from_array(fake_hist)
        host_feature_shares = {
            feat_id: FeatureHistogramShares(g_share=fake_share, h_share=fake_share)
            for feat_id in feature_data
        }
        bucket_indices_per_feature = {feat_id: [0] * N_SAMPLES for feat_id in feature_data}
        find_req = FindSplitRequest(
            node_id="nonexistent_node",
            host_feature_shares=host_feature_shares,
            bucket_indices_per_feature=bucket_indices_per_feature,
            n_buckets=N_BINS,
        )
        find_resp = _post(client, "/find_split", find_req)
        assert find_resp.status_code == 404


class TestApplySplit:
    def test_apply_split_returns_empty_dict(
        self, client: TestClient, sample_indices: list[int]
    ) -> None:
        # First call gradient_shares to create state
        grad_req = GradientShareRequest(node_id="node_0", sample_indices=sample_indices)
        _post(client, "/gradient_shares", grad_req)

        # Apply split
        apply_req = ApplySplitRequest(node_id="node_0", feature_id="f0", threshold=0.5)
        apply_resp = _post(client, "/apply_split", apply_req)
        assert apply_resp.status_code == 200
        assert apply_resp.json() == {}

    def test_apply_split_clears_state(
        self,
        client: TestClient,
        feature_data: dict[str, npt.NDArray[np.float64]],
        sample_indices: list[int],
    ) -> None:
        node_id = "node_clear"

        # Create state via gradient_shares
        grad_req = GradientShareRequest(node_id=node_id, sample_indices=sample_indices)
        _post(client, "/gradient_shares", grad_req)

        # Apply split → clears state
        apply_req = ApplySplitRequest(node_id=node_id, feature_id="f0", threshold=0.5)
        _post(client, "/apply_split", apply_req)

        # Now find_split should return 404 because state was cleared
        fake_hist = np.zeros(N_BINS, dtype=np.int64)
        fake_share = Share.from_array(fake_hist)
        host_feature_shares = {
            feat_id: FeatureHistogramShares(g_share=fake_share, h_share=fake_share)
            for feat_id in feature_data
        }
        bucket_indices_per_feature = {feat_id: [0] * N_SAMPLES for feat_id in feature_data}
        find_req = FindSplitRequest(
            node_id=node_id,
            host_feature_shares=host_feature_shares,
            bucket_indices_per_feature=bucket_indices_per_feature,
            n_buckets=N_BINS,
        )
        find_resp = _post(client, "/find_split", find_req)
        assert find_resp.status_code == 404, "State should have been cleared by apply_split"

    def test_apply_split_on_unknown_node_is_idempotent(self, client: TestClient) -> None:
        apply_req = ApplySplitRequest(
            node_id="does_not_exist", feature_id="f0", threshold=0.5
        )
        apply_resp = _post(client, "/apply_split", apply_req)
        assert apply_resp.status_code == 200
        assert apply_resp.json() == {}
