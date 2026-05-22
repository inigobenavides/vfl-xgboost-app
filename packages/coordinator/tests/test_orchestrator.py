"""Tests for the Coordinator orchestrator.

Uses a minimal FakeTransport (httpx.AsyncBaseTransport) to mock the four
party endpoints without any third-party mock library.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pytest

from packages.coordinator.orchestrator import Coordinator
from packages.shared.models import (
    FeatureHistogramShares,
    GradientShareResponse,
    HistogramShareResponse,
    ProtocolMessageEvent,
    Share,
    SplitDecision,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_SAMPLES = 20
N_BINS = 8
GUEST_URL = "http://guest"
HOST_URL = "http://host"
RUN_ID = "test-run-001"

# ---------------------------------------------------------------------------
# Mock transport
# ---------------------------------------------------------------------------


def _response(body: str, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        headers={"content-type": "application/json"},
        content=body.encode(),
    )


class FakeTransport(httpx.AsyncBaseTransport):
    """Dispatch mock responses based on (host, path)."""

    def __init__(self, routes: dict[tuple[str, str], str]) -> None:
        # routes maps (host, path) → JSON response body
        self._routes = routes

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        key = (request.url.host, request.url.path)
        if key not in self._routes:
            return _response(
                json.dumps({"detail": f"No mock for {key}"}), status=404
            )
        return _response(self._routes[key])


# ---------------------------------------------------------------------------
# Shared placeholder shares
# ---------------------------------------------------------------------------


def _zero_share(size: int) -> Share:
    return Share.from_array(np.zeros(size, dtype=np.int64))


def _make_routes() -> dict[tuple[str, str], str]:
    """Build mock response bodies for all four protocol steps."""

    # Step 1 — guest /gradient_shares → GradientShareResponse
    grad_resp = GradientShareResponse(
        g_share_a=_zero_share(N_SAMPLES),
        h_share_a=_zero_share(N_SAMPLES),
    )

    # Step 2 — host /histogram_shares → HistogramShareResponse
    hist_resp = HistogramShareResponse(
        feature_shares={
            "f0": FeatureHistogramShares(
                g_share=_zero_share(N_BINS),
                h_share=_zero_share(N_BINS),
            ),
            "f1": FeatureHistogramShares(
                g_share=_zero_share(N_BINS),
                h_share=_zero_share(N_BINS),
            ),
        },
        bucket_indices_per_feature={
            "f0": list(range(N_SAMPLES)),
            "f1": list(range(N_SAMPLES)),
        },
        n_buckets=N_BINS,
    )

    # Step 3 — guest /find_split → SplitDecision
    split = SplitDecision(feature_id="f0", threshold=3.0, gain=0.42)

    # Step 4 — both /apply_split → {}
    apply_body = "{}"

    return {
        ("guest", "/gradient_shares"): grad_resp.model_dump_json(),
        ("host", "/histogram_shares"): hist_resp.model_dump_json(),
        ("guest", "/find_split"): split.model_dump_json(),
        ("guest", "/apply_split"): apply_body,
        ("host", "/apply_split"): apply_body,
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def trace_dir(tmp_path: Path) -> Path:
    return tmp_path / "traces"


@pytest.fixture()
async def run_result(
    trace_dir: Path,
) -> tuple[SplitDecision, Path]:
    """Run the coordinator against the fake transport and return (decision, trace_path)."""
    transport = FakeTransport(_make_routes())
    async with httpx.AsyncClient(transport=transport) as client:
        coord = Coordinator(
            guest_url=GUEST_URL,
            host_url=HOST_URL,
            trace_dir=trace_dir,
            run_id=RUN_ID,
            client=client,
        )
        decision = await coord.run_node("node_0", list(range(N_SAMPLES)))

    trace_path = trace_dir / f"{RUN_ID}.json"
    return decision, trace_path


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCoordinatorRunNode:
    async def test_returns_split_decision_with_nonempty_feature_id(
        self, run_result: tuple[SplitDecision, Path]
    ) -> None:
        decision, _ = run_result
        assert isinstance(decision, SplitDecision)
        assert decision.feature_id != ""

    async def test_trace_file_exists(
        self, run_result: tuple[SplitDecision, Path]
    ) -> None:
        _, trace_path = run_result
        assert trace_path.exists(), f"Trace file not found at {trace_path}"

    async def test_trace_has_exactly_four_entries(
        self, run_result: tuple[SplitDecision, Path]
    ) -> None:
        _, trace_path = run_result
        lines = [ln for ln in trace_path.read_text().splitlines() if ln.strip()]
        assert len(lines) == 4, f"Expected 4 trace entries, got {len(lines)}"

    async def test_all_trace_entries_pass_privacy_check(
        self, run_result: tuple[SplitDecision, Path]
    ) -> None:
        _, trace_path = run_result
        lines = [ln for ln in trace_path.read_text().splitlines() if ln.strip()]
        entries: list[Any] = [json.loads(ln) for ln in lines]
        for i, raw in enumerate(entries):
            entry = ProtocolMessageEvent.model_validate(raw)
            assert entry.privacy_check.no_raw_gradients is True, (
                f"Entry {i} failed privacy_check.no_raw_gradients"
            )
            assert entry.privacy_check.no_raw_features is True, (
                f"Entry {i} failed privacy_check.no_raw_features"
            )

    async def test_trace_entries_have_sequential_step_numbers(
        self, run_result: tuple[SplitDecision, Path]
    ) -> None:
        _, trace_path = run_result
        lines = [ln for ln in trace_path.read_text().splitlines() if ln.strip()]
        steps = [ProtocolMessageEvent.model_validate(json.loads(ln)).step for ln in lines]
        assert steps == [1, 2, 3, 4], f"Expected steps [1,2,3,4], got {steps}"

    async def test_trace_entries_have_correct_node_id(
        self, run_result: tuple[SplitDecision, Path]
    ) -> None:
        _, trace_path = run_result
        lines = [ln for ln in trace_path.read_text().splitlines() if ln.strip()]
        for ln in lines:
            entry = ProtocolMessageEvent.model_validate(json.loads(ln))
            assert entry.node_id == "node_0"
