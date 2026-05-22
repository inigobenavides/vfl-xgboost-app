from __future__ import annotations

import base64
from datetime import datetime

import numpy as np
import numpy.typing as npt
from pydantic import Base64Bytes, BaseModel, ConfigDict


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


class ApplySplitRequest(BaseModel):
    """Coordinator → Guest/Host: partition samples according to the chosen split."""

    node_id: str
    feature_id: str
    threshold: float


# --- Protocol trace ---


class PrivacyCheck(BaseModel):
    """Assertions about what was absent from a protocol message."""

    no_raw_gradients: bool = True
    no_raw_features: bool = True


class TraceEntry(BaseModel):
    """One protocol step recorded by the coordinator."""

    step: int
    node_id: str
    from_party: str
    to_party: str
    payload_type: str
    payload_shape: tuple[int, ...]
    timestamp: datetime
    privacy_check: PrivacyCheck
