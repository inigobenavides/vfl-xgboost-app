import json

import numpy as np

from packages.shared import (
    ApplySplitRequest,
    FindSplitRequest,
    GradientShareRequest,
    GradientShareResponse,
    HistogramShareRequest,
    HistogramShareResponse,
    Share,
    SplitDecision,
)


def make_int64_array(n: int = 8) -> np.ndarray:  # type: ignore[type-arg]
    return np.array([1, -2, 3, -4, 5, -6, 7, -8], dtype=np.int64)[:n]


class TestShareRoundTrip:
    def test_from_array_to_array_int64(self) -> None:
        original = make_int64_array()
        share = Share.from_array(original)
        recovered = share.to_array()
        np.testing.assert_array_equal(original, recovered)

    def test_from_array_to_array_float64(self) -> None:
        original = np.array([0.1, -0.2, 0.3], dtype=np.float64)
        share = Share.from_array(original)
        recovered = share.to_array()
        np.testing.assert_array_almost_equal(original, recovered)  # type: ignore[arg-type]

    def test_json_roundtrip(self) -> None:
        original = make_int64_array()
        share = Share.from_array(original)

        json_str = share.model_dump_json()
        parsed = json.loads(json_str)

        assert "data" in parsed
        assert parsed["dtype"] == "int64"
        assert parsed["shape"] == [8]

        recovered_share = Share.model_validate_json(json_str)
        np.testing.assert_array_equal(original, recovered_share.to_array())

    def test_shape_preserved(self) -> None:
        original = make_int64_array(8)
        share = Share.from_array(original)
        assert share.shape == (8,)
        assert share.dtype == "int64"

    def test_2d_array_roundtrip(self) -> None:
        original = np.arange(12, dtype=np.int64).reshape(3, 4)
        share = Share.from_array(original)
        recovered = share.to_array().reshape(3, 4)
        np.testing.assert_array_equal(original, recovered)


class TestRequestResponseModels:
    def test_gradient_share_request_json(self) -> None:
        req = GradientShareRequest(node_id="node_0", sample_indices=[0, 1, 2])
        assert GradientShareRequest.model_validate_json(req.model_dump_json()) == req

    def test_gradient_share_response_json(self) -> None:
        share = Share.from_array(make_int64_array())
        resp = GradientShareResponse(share_a=share)
        recovered = GradientShareResponse.model_validate_json(resp.model_dump_json())
        np.testing.assert_array_equal(
            share.to_array(), recovered.share_a.to_array()
        )

    def test_histogram_share_request_json(self) -> None:
        share = Share.from_array(make_int64_array())
        req = HistogramShareRequest(node_id="node_0", sample_indices=[0, 1], share_a=share)
        recovered = HistogramShareRequest.model_validate_json(req.model_dump_json())
        np.testing.assert_array_equal(share.to_array(), recovered.share_a.to_array())

    def test_histogram_share_response_json(self) -> None:
        share = Share.from_array(make_int64_array())
        resp = HistogramShareResponse(histogram_shares={"feature_0": share})
        recovered = HistogramShareResponse.model_validate_json(resp.model_dump_json())
        np.testing.assert_array_equal(
            share.to_array(), recovered.histogram_shares["feature_0"].to_array()
        )

    def test_find_split_request_json(self) -> None:
        share = Share.from_array(make_int64_array())
        req = FindSplitRequest(node_id="node_0", host_histogram_shares={"f0": share})
        recovered = FindSplitRequest.model_validate_json(req.model_dump_json())
        np.testing.assert_array_equal(
            share.to_array(), recovered.host_histogram_shares["f0"].to_array()
        )

    def test_split_decision_json(self) -> None:
        decision = SplitDecision(feature_id="feature_3", threshold=0.42, gain=1.23)
        assert SplitDecision.model_validate_json(decision.model_dump_json()) == decision

    def test_apply_split_request_json(self) -> None:
        req = ApplySplitRequest(node_id="node_0", feature_id="feature_3", threshold=0.42)
        assert ApplySplitRequest.model_validate_json(req.model_dump_json()) == req
