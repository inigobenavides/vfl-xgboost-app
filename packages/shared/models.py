from __future__ import annotations

import base64
from datetime import datetime
from typing import Annotated, Literal

import numpy as np
import numpy.typing as npt
from pydantic import Base64Bytes, BaseModel, ConfigDict, Field, TypeAdapter


class Share(BaseModel):
    """Wire-safe representation of a secret-share: base64-encoded numpy bytes + metadata."""

    model_config = ConfigDict(frozen=True)

    data: Base64Bytes
    dtype: str
    shape: tuple[int, ...]

    @classmethod
    def from_array(cls, array: npt.NDArray[np.generic]) -> Share:
        return cls(
            data=base64.b64encode(array.tobytes()),
            dtype=str(array.dtype),
            shape=tuple(int(d) for d in array.shape),
        )

    def to_array(self) -> npt.NDArray[np.generic]:
        arr: npt.NDArray[np.generic] = np.frombuffer(  # type: ignore[assignment]
            self.data, dtype=np.dtype(self.dtype)
        ).reshape(self.shape)
        return arr


# --- Guest endpoints ---


class GradientShareRequest(BaseModel):
    """Coordinator → Guest: compute gradient shares for samples at this node."""

    node_id: str
    sample_indices: list[int]


class GradientShareResponse(BaseModel):
    """Guest → Coordinator: share_A for both g and h to relay to the host."""

    g_share_a: Share
    h_share_a: Share


class FeatureHistogramShares(BaseModel):
    """A pair of histogram shares (g and h) for one feature."""

    g_share: Share
    h_share: Share


class FindSplitRequest(BaseModel):
    """Coordinator → Guest: host histogram shares to reconstruct and find best split."""

    node_id: str
    host_feature_shares: dict[str, FeatureHistogramShares]  # keyed by feature_id
    bucket_indices_per_feature: dict[str, list[int]]
    n_buckets: int


class SplitDecision(BaseModel):
    """Guest → Coordinator: best split found after reconstruction."""

    feature_id: str
    threshold: float
    gain: float


# --- Host endpoints ---


class HistogramShareRequest(BaseModel):
    """Coordinator → Host: compute per-feature histogram shares using relayed share_A."""

    node_id: str
    sample_indices: list[int]
    g_share_a: Share
    h_share_a: Share


class HistogramShareResponse(BaseModel):
    """Host → Coordinator: cumulative histogram shares per feature (length B each)."""

    feature_shares: dict[str, FeatureHistogramShares]  # keyed by feature_id
    bucket_indices_per_feature: dict[str, list[int]]  # keyed by feature_id; relayed to guest
    n_buckets: int


# --- Shared endpoints ---


class UpdatePredictionsRequest(BaseModel):
    """Coordinator → Guest: update predictions after one tree is built.

    sample_leaf_weights[i] is the leaf weight assigned to training sample i
    by the tree just built. The guest accumulates logit[i] += lr * weight[i]
    and recomputes its prediction probabilities.
    """

    sample_leaf_weights: list[float]
    learning_rate: float


class ApplySplitRequest(BaseModel):
    """Coordinator → Guest/Host: partition samples according to the chosen split."""

    node_id: str
    feature_id: str
    threshold: float


# --- Protocol trace events ---

# Every event in a trace JSONL file is one variant of TraceEvent, distinguished by
# its "type" discriminator field. The trace file is consumed by the UI (slice #16
# and onward) as a discriminated-union stream.


class PrivacyCheck(BaseModel):
    """Assertions about what was absent from a protocol message."""

    no_raw_gradients: bool = True
    no_raw_features: bool = True


class ProtocolMessageEvent(BaseModel):
    """One protocol-round-trip message — what the coordinator orchestrator records.

    Replaces the earlier TraceEntry type. Carries the same fields plus a `type`
    discriminator so it can sit in the trace JSONL alongside higher-level events.
    """

    type: Literal["protocol_message"] = "protocol_message"
    step: int
    node_id: str
    from_party: str
    to_party: str
    payload_type: str
    payload_shape: tuple[int, ...]
    timestamp: datetime
    privacy_check: PrivacyCheck


class TreeStartEvent(BaseModel):
    """Marks the start of training a single tree in the boosting loop."""

    type: Literal["tree_start"] = "tree_start"
    tree_index: int
    n_samples: int
    timestamp: datetime


class NodeExpandedEvent(BaseModel):
    """A tree node has been finalised — either an internal split or a leaf."""

    type: Literal["node_expanded"] = "node_expanded"
    tree_index: int
    node_id: str
    parent_id: str | None
    depth: int
    n_samples: int
    samples_l: int
    samples_r: int
    feature_id: str | None
    threshold_bin: int | None
    gain: float | None
    leaf_weight: float | None
    is_leaf: bool
    timestamp: datetime


class GainCurveEvent(BaseModel):
    """Per-feature gain over candidate thresholds — emitted for the canonical node only."""

    type: Literal["gain_curve"] = "gain_curve"
    tree_index: int
    node_id: str
    # per_feature[feature_id] = list of (threshold_bin, gain) pairs, valid candidates only.
    per_feature: dict[str, list[tuple[int, float]]]
    timestamp: datetime


class ReconstructionAggregateEvent(BaseModel):
    """G and H per bucket for the winning feature at the canonical reconstruction node.

    The UI drives its "two opaque pills fuse into a clean histogram" beat off this event.
    Number of bars equals the number of histogram buckets — visibly an aggregate,
    not a per-sample list.
    """

    type: Literal["reconstruction_aggregate"] = "reconstruction_aggregate"
    tree_index: int
    node_id: str
    feature_id: str
    g_per_bucket: list[float]
    h_per_bucket: list[float]
    timestamp: datetime


class AucDeltaEvent(BaseModel):
    """Test-set AUC measured after one tree has been added to the ensemble."""

    type: Literal["auc_delta"] = "auc_delta"
    tree_index: int
    auc: float
    timestamp: datetime


type ChapterName = Literal["act1_start", "reconstruction", "act2_start", "final"]


class ChapterMarkerEvent(BaseModel):
    """A demo-narrative chapter boundary stamped into the trace by the bake script.

    The four chapters drive the UI HUD's chapter ticks: Act 1 start, the reconstruction
    beat, Act 2 start, and the final-reveal hold.
    """

    type: Literal["chapter_marker"] = "chapter_marker"
    chapter: ChapterName
    timestamp: datetime


type TraceEvent = (
    ProtocolMessageEvent
    | TreeStartEvent
    | NodeExpandedEvent
    | GainCurveEvent
    | ReconstructionAggregateEvent
    | AucDeltaEvent
    | ChapterMarkerEvent
)


# TypeAdapter for parsing trace JSONL — dispatches to the right variant by the
# "type" discriminator field. Importers use:
#   event = TraceEventAdapter.validate_json(line)
TraceEventAdapter: TypeAdapter[TraceEvent] = TypeAdapter(
    Annotated[TraceEvent, Field(discriminator="type")]
)
