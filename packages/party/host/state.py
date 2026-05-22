from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt


@dataclass
class HostState:
    features: npt.NDArray[np.float64]
    feature_names: list[str]
    bin_boundaries: dict[str, npt.NDArray[np.float64]]
    n_bins: int
    node_partitions: dict[str, npt.NDArray[np.int64]] = field(default_factory=dict)  # type: ignore[assignment]
