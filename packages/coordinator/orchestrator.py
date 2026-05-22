"""Protocol orchestrator — drives the four-step VFL-XGBoost split-finding round."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import httpx

from packages.coordinator.trace import TraceWriter
from packages.shared.models import (
    ApplySplitRequest,
    FindSplitRequest,
    GradientShareRequest,
    GradientShareResponse,
    HistogramShareRequest,
    HistogramShareResponse,
    PrivacyCheck,
    SplitDecision,
    TraceEntry,
    UpdatePredictionsRequest,
)

_JSON_HEADERS = {"content-type": "application/json"}


def _now() -> datetime:
    return datetime.now(tz=UTC)


class Coordinator:
    """Drives the four-step VFL-XGBoost split-finding protocol.

    Protocol steps per node:
      1. POST guest  /gradient_shares   → GradientShareResponse
      2. POST host   /histogram_shares  → HistogramShareResponse
      3. POST guest  /find_split        → SplitDecision
      4. POST guest  /apply_split       → {}
         POST host   /apply_split       → {}

    After each step a :class:`TraceEntry` is appended to
    ``<trace_dir>/<run_id>.json`` (newline-delimited JSON).
    Raw share values are never recorded — only metadata.
    """

    def __init__(
        self,
        guest_url: str,
        host_url: str,
        trace_dir: Path,
        run_id: str,
        client: httpx.AsyncClient,
    ) -> None:
        self._guest_url = guest_url.rstrip("/")
        self._host_url = host_url.rstrip("/")
        self._trace_dir = trace_dir
        self._run_id = run_id
        self._client = client

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _post(self, url: str, body: str) -> httpx.Response:
        resp = await self._client.post(url, content=body, headers=_JSON_HEADERS)
        resp.raise_for_status()
        return resp

    def _trace_entry(
        self,
        step: int,
        node_id: str,
        from_party: str,
        to_party: str,
        payload_type: str,
        payload_shape: tuple[int, ...],
    ) -> TraceEntry:
        return TraceEntry(
            step=step,
            node_id=node_id,
            from_party=from_party,
            to_party=to_party,
            payload_type=payload_type,
            payload_shape=payload_shape,
            timestamp=_now(),
            privacy_check=PrivacyCheck(no_raw_gradients=True, no_raw_features=True),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def update_predictions(
        self,
        sample_leaf_weights: list[float],
        learning_rate: float,
    ) -> None:
        """Step 5 — broadcast leaf weights to the guest so it can update predictions."""
        req = UpdatePredictionsRequest(
            sample_leaf_weights=sample_leaf_weights,
            learning_rate=learning_rate,
        )
        await self._post(f"{self._guest_url}/update_predictions", req.model_dump_json())

    async def run_node(
        self,
        node_id: str,
        sample_indices: list[int],
    ) -> SplitDecision:
        """Execute the four-step protocol for one tree node.

        Returns the :class:`SplitDecision` produced by the guest after
        reconstructing the host's histogram shares.
        """
        n_samples = len(sample_indices)
        trace_path = self._trace_dir / f"{self._run_id}.json"

        with TraceWriter(trace_path) as tw:
            # ----------------------------------------------------------
            # Step 1 — Coordinator → Guest: compute gradient shares
            # ----------------------------------------------------------
            req1 = GradientShareRequest(node_id=node_id, sample_indices=sample_indices)
            raw1 = await self._post(
                f"{self._guest_url}/gradient_shares", req1.model_dump_json()
            )
            resp1 = GradientShareResponse.model_validate_json(raw1.text)

            tw.append(
                self._trace_entry(
                    step=1,
                    node_id=node_id,
                    from_party="coordinator",
                    to_party="guest",
                    payload_type="GradientShareResponse",
                    # Shape reflects the per-sample shares (g and h each have n_samples)
                    payload_shape=(n_samples,),
                )
            )

            # ----------------------------------------------------------
            # Step 2 — Coordinator → Host: compute histogram shares
            # ----------------------------------------------------------
            req2 = HistogramShareRequest(
                node_id=node_id,
                sample_indices=sample_indices,
                g_share_a=resp1.g_share_a,
                h_share_a=resp1.h_share_a,
            )
            raw2 = await self._post(
                f"{self._host_url}/histogram_shares", req2.model_dump_json()
            )
            resp2 = HistogramShareResponse.model_validate_json(raw2.text)

            tw.append(
                self._trace_entry(
                    step=2,
                    node_id=node_id,
                    from_party="coordinator",
                    to_party="host",
                    payload_type="HistogramShareResponse",
                    # Shape: (n_features, n_buckets) summarises the histogram tensor
                    payload_shape=(len(resp2.feature_shares), resp2.n_buckets),
                )
            )

            # ----------------------------------------------------------
            # Step 3 — Coordinator → Guest: find best split
            # ----------------------------------------------------------
            req3 = FindSplitRequest(
                node_id=node_id,
                host_feature_shares=resp2.feature_shares,
                bucket_indices_per_feature=resp2.bucket_indices_per_feature,
                n_buckets=resp2.n_buckets,
            )
            raw3 = await self._post(f"{self._guest_url}/find_split", req3.model_dump_json())
            decision = SplitDecision.model_validate_json(raw3.text)

            tw.append(
                self._trace_entry(
                    step=3,
                    node_id=node_id,
                    from_party="coordinator",
                    to_party="guest",
                    payload_type="SplitDecision",
                    # Scalar result; shape (1,) for uniformity
                    payload_shape=(1,),
                )
            )

            # ----------------------------------------------------------
            # Step 4 — Coordinator → Guest + Host: apply split
            # ----------------------------------------------------------
            req4 = ApplySplitRequest(
                node_id=node_id,
                feature_id=decision.feature_id,
                threshold=decision.threshold,
            )
            body4 = req4.model_dump_json()
            # Fire both requests; we don't need to wait for one before the other
            # but we must await both to ensure completion.
            await self._post(f"{self._guest_url}/apply_split", body4)
            await self._post(f"{self._host_url}/apply_split", body4)

            tw.append(
                self._trace_entry(
                    step=4,
                    node_id=node_id,
                    from_party="coordinator",
                    to_party="guest+host",
                    payload_type="ApplySplitRequest",
                    # Two parties receive identical messages
                    payload_shape=(2,),
                )
            )

        return decision
