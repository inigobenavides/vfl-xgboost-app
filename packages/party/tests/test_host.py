"""Tests for the host-party FastAPI service."""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from packages.crypto import AdditiveSSProtocol
from packages.party.host import create_host_app
from packages.shared.models import Share

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

N_SAMPLES = 20
N_FEATURES = 3
N_BINS = 8
FEATURE_NAMES = ["feat_0", "feat_1", "feat_2"]

RNG = np.random.default_rng(42)
_FEATURES: np.ndarray = RNG.random((N_SAMPLES, N_FEATURES)).astype(np.float64)  # type: ignore[type-arg]


@pytest.fixture()
def client() -> TestClient:
    app = create_host_app(
        features=_FEATURES,
        feature_names=FEATURE_NAMES,
        n_bins=N_BINS,
    )
    # TestClient must be used as a context manager so that the ASGI lifespan
    # events fire and app.state.host_state is populated before any request.
    with TestClient(app, raise_server_exceptions=True) as tc:
        return tc


def _make_shares(n_samples: int) -> tuple[Share, Share]:
    """Return a pair of int64 shares of length n_samples using the crypto protocol."""
    proto = AdditiveSSProtocol(rng=np.random.default_rng(0))
    values = np.ones(n_samples, dtype=np.float64) * 0.5
    g_a, _g_b = proto.share(values)
    h_a, _h_b = proto.share(values)
    return Share.from_array(g_a), Share.from_array(h_a)


# ---------------------------------------------------------------------------
# POST /histogram_shares
# ---------------------------------------------------------------------------


class TestHistogramShares:
    def test_returns_all_features(self, client: TestClient) -> None:
        sample_indices = list(range(N_SAMPLES))
        g_share, h_share = _make_shares(N_SAMPLES)

        resp = client.post(
            "/histogram_shares",
            content=_build_request_json(sample_indices, g_share, h_share),
            headers={"Content-Type": "application/json"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert set(data["feature_shares"].keys()) == set(FEATURE_NAMES)

    def test_histogram_shapes(self, client: TestClient) -> None:
        """Each feature should have g_share and h_share of length n_bins."""
        sample_indices = list(range(N_SAMPLES))
        g_share, h_share = _make_shares(N_SAMPLES)

        resp = client.post(
            "/histogram_shares",
            content=_build_request_json(sample_indices, g_share, h_share),
            headers={"Content-Type": "application/json"},
        )

        assert resp.status_code == 200
        data = resp.json()

        for feat_name in FEATURE_NAMES:
            feat_data = data["feature_shares"][feat_name]
            g_arr = Share.model_validate(feat_data["g_share"]).to_array()
            h_arr = Share.model_validate(feat_data["h_share"]).to_array()
            assert g_arr.shape == (N_BINS,), f"{feat_name} g_share shape mismatch"
            assert h_arr.shape == (N_BINS,), f"{feat_name} h_share shape mismatch"

    def test_n_buckets_in_response(self, client: TestClient) -> None:
        sample_indices = list(range(N_SAMPLES))
        g_share, h_share = _make_shares(N_SAMPLES)

        resp = client.post(
            "/histogram_shares",
            content=_build_request_json(sample_indices, g_share, h_share),
            headers={"Content-Type": "application/json"},
        )

        assert resp.status_code == 200
        assert resp.json()["n_buckets"] == N_BINS

    def test_bucket_indices_per_feature_returned(self, client: TestClient) -> None:
        sample_indices = list(range(N_SAMPLES))
        g_share, h_share = _make_shares(N_SAMPLES)

        resp = client.post(
            "/histogram_shares",
            content=_build_request_json(sample_indices, g_share, h_share),
            headers={"Content-Type": "application/json"},
        )

        assert resp.status_code == 200
        data = resp.json()
        bipp = data["bucket_indices_per_feature"]
        assert set(bipp.keys()) == set(FEATURE_NAMES)
        for feat_name in FEATURE_NAMES:
            assert len(bipp[feat_name]) == len(sample_indices)

    def test_subset_of_samples(self, client: TestClient) -> None:
        """Endpoint should work with a strict subset of samples."""
        sample_indices = [0, 5, 10, 15]
        g_share, h_share = _make_shares(len(sample_indices))

        resp = client.post(
            "/histogram_shares",
            content=_build_request_json(sample_indices, g_share, h_share),
            headers={"Content-Type": "application/json"},
        )

        assert resp.status_code == 200
        data = resp.json()
        for feat_name in FEATURE_NAMES:
            feat_data = data["feature_shares"][feat_name]
            g_arr = Share.model_validate(feat_data["g_share"]).to_array()
            assert g_arr.shape == (N_BINS,)


# ---------------------------------------------------------------------------
# POST /apply_split
# ---------------------------------------------------------------------------


class TestApplySplit:
    def test_returns_empty_dict(self, client: TestClient) -> None:
        # First register a node partition via histogram_shares.
        sample_indices = list(range(N_SAMPLES))
        g_share, h_share = _make_shares(N_SAMPLES)
        client.post(
            "/histogram_shares",
            content=_build_request_json(sample_indices, g_share, h_share, node_id="node_1"),
            headers={"Content-Type": "application/json"},
        )

        resp = client.post(
            "/apply_split",
            json={
                "node_id": "node_1",
                "feature_id": FEATURE_NAMES[0],
                "threshold": 0.5,
            },
        )

        assert resp.status_code == 200
        assert resp.json() == {}

    def test_apply_split_unknown_node_still_succeeds(self, client: TestClient) -> None:
        """If no partition exists for the node, fall back to all samples."""
        resp = client.post(
            "/apply_split",
            json={
                "node_id": "unknown_node",
                "feature_id": FEATURE_NAMES[1],
                "threshold": 0.3,
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_request_json(
    sample_indices: list[int],
    g_share: Share,
    h_share: Share,
    node_id: str = "node_0",
) -> str:
    """Build a JSON string for a HistogramShareRequest."""
    import json as _json

    return _json.dumps(
        {
            "node_id": node_id,
            "sample_indices": sample_indices,
            "g_share_a": _json.loads(g_share.model_dump_json()),
            "h_share_a": _json.loads(h_share.model_dump_json()),
        }
    )
