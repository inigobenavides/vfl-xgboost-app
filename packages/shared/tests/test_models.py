import json
from datetime import UTC, datetime

import numpy as np

from packages.shared import (
    ApplySplitRequest,
    AucDeltaEvent,
    ChapterMarkerEvent,
    FeatureHistogramShares,
    FindSplitRequest,
    GainCurveEvent,
    GradientShareRequest,
    GradientShareResponse,
    HistogramShareRequest,
    HistogramShareResponse,
    NodeExpandedEvent,
    PrivacyCheck,
    ProtocolMessageEvent,
    ReconstructionAggregateEvent,
    Share,
    SplitDecision,
    TraceEventAdapter,
    TreeStartEvent,
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
        resp = GradientShareResponse(g_share_a=share, h_share_a=share)
        recovered = GradientShareResponse.model_validate_json(resp.model_dump_json())
        np.testing.assert_array_equal(
            share.to_array(), recovered.g_share_a.to_array()
        )
        np.testing.assert_array_equal(
            share.to_array(), recovered.h_share_a.to_array()
        )

    def test_histogram_share_request_json(self) -> None:
        share = Share.from_array(make_int64_array())
        req = HistogramShareRequest(
            node_id="node_0",
            sample_indices=[0, 1],
            g_share_a=share,
            h_share_a=share,
        )
        recovered = HistogramShareRequest.model_validate_json(req.model_dump_json())
        np.testing.assert_array_equal(share.to_array(), recovered.g_share_a.to_array())

    def test_histogram_share_response_json(self) -> None:
        share = Share.from_array(make_int64_array())
        feat_shares = FeatureHistogramShares(g_share=share, h_share=share)
        resp = HistogramShareResponse(
            feature_shares={"feature_0": feat_shares},
            bucket_indices_per_feature={"feature_0": [0, 1, 2, 3, 4, 5, 6, 7]},
            n_buckets=8,
        )
        recovered = HistogramShareResponse.model_validate_json(resp.model_dump_json())
        np.testing.assert_array_equal(
            share.to_array(), recovered.feature_shares["feature_0"].g_share.to_array()
        )

    def test_find_split_request_json(self) -> None:
        share = Share.from_array(make_int64_array())
        feat_shares = FeatureHistogramShares(g_share=share, h_share=share)
        req = FindSplitRequest(
            node_id="node_0",
            host_feature_shares={"f0": feat_shares},
            bucket_indices_per_feature={"f0": [0, 1, 2, 3, 4, 5, 6, 7]},
            n_buckets=8,
        )
        recovered = FindSplitRequest.model_validate_json(req.model_dump_json())
        np.testing.assert_array_equal(
            share.to_array(),
            recovered.host_feature_shares["f0"].g_share.to_array(),
        )

    def test_split_decision_json(self) -> None:
        decision = SplitDecision(feature_id="feature_3", threshold=0.42, gain=1.23)
        assert SplitDecision.model_validate_json(decision.model_dump_json()) == decision

    def test_apply_split_request_json(self) -> None:
        req = ApplySplitRequest(node_id="node_0", feature_id="feature_3", threshold=0.42)
        assert ApplySplitRequest.model_validate_json(req.model_dump_json()) == req


# ---------------------------------------------------------------------------
# Trace events (discriminated union)
# ---------------------------------------------------------------------------


_TS = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


class TestTraceEventRoundTrips:
    """Each variant must serialize and re-parse identically. The TraceEventAdapter
    must dispatch to the right concrete type based on the `type` discriminator."""

    def test_protocol_message_event_roundtrip(self) -> None:
        event = ProtocolMessageEvent(
            step=2,
            node_id="t0/n0",
            from_party="coordinator",
            to_party="host",
            payload_type="HistogramShareResponse",
            payload_shape=(6, 64),
            timestamp=_TS,
            privacy_check=PrivacyCheck(),
        )
        assert ProtocolMessageEvent.model_validate_json(event.model_dump_json()) == event

    def test_tree_start_event_roundtrip(self) -> None:
        event = TreeStartEvent(tree_index=0, n_samples=4000, timestamp=_TS)
        assert TreeStartEvent.model_validate_json(event.model_dump_json()) == event

    def test_node_expanded_event_internal_roundtrip(self) -> None:
        event = NodeExpandedEvent(
            tree_index=0,
            node_id="t0/n0",
            parent_id=None,
            depth=0,
            n_samples=4000,
            samples_l=2100,
            samples_r=1900,
            feature_id="age",
            threshold_bin=17,
            gain=0.043,
            leaf_weight=None,
            is_leaf=False,
            timestamp=_TS,
        )
        assert NodeExpandedEvent.model_validate_json(event.model_dump_json()) == event

    def test_node_expanded_event_leaf_roundtrip(self) -> None:
        event = NodeExpandedEvent(
            tree_index=0,
            node_id="t0/n3",
            parent_id="t0/n1",
            depth=4,
            n_samples=120,
            samples_l=0,
            samples_r=0,
            feature_id=None,
            threshold_bin=None,
            gain=None,
            leaf_weight=-0.21,
            is_leaf=True,
            timestamp=_TS,
        )
        assert NodeExpandedEvent.model_validate_json(event.model_dump_json()) == event

    def test_gain_curve_event_roundtrip(self) -> None:
        event = GainCurveEvent(
            tree_index=0,
            node_id="t0/n0",
            per_feature={
                "age": [(0, 0.01), (1, 0.02), (2, 0.015)],
                "hours-per-week": [(0, 0.003), (1, 0.012)],
            },
            timestamp=_TS,
        )
        assert GainCurveEvent.model_validate_json(event.model_dump_json()) == event

    def test_reconstruction_aggregate_event_roundtrip(self) -> None:
        event = ReconstructionAggregateEvent(
            tree_index=0,
            node_id="t0/n0",
            feature_id="age",
            g_per_bucket=[-0.5, -0.3, 0.0, 0.4, 0.8],
            h_per_bucket=[0.1, 0.2, 0.25, 0.3, 0.15],
            timestamp=_TS,
        )
        assert (
            ReconstructionAggregateEvent.model_validate_json(event.model_dump_json())
            == event
        )

    def test_auc_delta_event_roundtrip(self) -> None:
        event = AucDeltaEvent(tree_index=5, auc=0.7321, timestamp=_TS)
        assert AucDeltaEvent.model_validate_json(event.model_dump_json()) == event

    def test_chapter_marker_event_roundtrip(self) -> None:
        for chapter in ("act1_start", "reconstruction", "act2_start", "final"):
            event = ChapterMarkerEvent(chapter=chapter, timestamp=_TS)  # type: ignore[arg-type]
            assert ChapterMarkerEvent.model_validate_json(event.model_dump_json()) == event


class TestTraceEventDiscrimination:
    """The TraceEventAdapter dispatches to the right concrete variant from JSON."""

    def test_adapter_dispatches_protocol_message(self) -> None:
        event = ProtocolMessageEvent(
            step=1,
            node_id="t0/n0",
            from_party="coordinator",
            to_party="guest",
            payload_type="GradientShareResponse",
            payload_shape=(4096,),
            timestamp=_TS,
            privacy_check=PrivacyCheck(),
        )
        parsed = TraceEventAdapter.validate_json(event.model_dump_json())
        assert isinstance(parsed, ProtocolMessageEvent)
        assert parsed == event

    def test_adapter_dispatches_tree_start(self) -> None:
        event = TreeStartEvent(tree_index=3, n_samples=4000, timestamp=_TS)
        parsed = TraceEventAdapter.validate_json(event.model_dump_json())
        assert isinstance(parsed, TreeStartEvent)

    def test_adapter_dispatches_chapter_marker(self) -> None:
        event = ChapterMarkerEvent(chapter="reconstruction", timestamp=_TS)
        parsed = TraceEventAdapter.validate_json(event.model_dump_json())
        assert isinstance(parsed, ChapterMarkerEvent)
        assert parsed.chapter == "reconstruction"

    def test_adapter_dispatches_node_expanded(self) -> None:
        event = NodeExpandedEvent(
            tree_index=0,
            node_id="t0/n0",
            parent_id=None,
            depth=0,
            n_samples=10,
            samples_l=5,
            samples_r=5,
            feature_id="age",
            threshold_bin=2,
            gain=0.1,
            leaf_weight=None,
            is_leaf=False,
            timestamp=_TS,
        )
        parsed = TraceEventAdapter.validate_json(event.model_dump_json())
        assert isinstance(parsed, NodeExpandedEvent)

    def test_adapter_preserves_jsonl_round_trip(self) -> None:
        events = [
            ChapterMarkerEvent(chapter="act1_start", timestamp=_TS),
            TreeStartEvent(tree_index=0, n_samples=10, timestamp=_TS),
            AucDeltaEvent(tree_index=0, auc=0.61, timestamp=_TS),
            ChapterMarkerEvent(chapter="final", timestamp=_TS),
        ]
        jsonl = "\n".join(e.model_dump_json() for e in events)
        parsed = [TraceEventAdapter.validate_json(line) for line in jsonl.splitlines()]
        assert [type(e).__name__ for e in parsed] == [
            "ChapterMarkerEvent",
            "TreeStartEvent",
            "AucDeltaEvent",
            "ChapterMarkerEvent",
        ]

    def test_unknown_type_raises(self) -> None:
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            TraceEventAdapter.validate_json(
                json.dumps({"type": "definitely_not_a_real_event_type"})
            )
