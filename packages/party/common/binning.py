from __future__ import annotations

import numpy as np
import numpy.typing as npt


def compute_bin_boundaries(data: npt.NDArray[np.float64], n_bins: int) -> npt.NDArray[np.float64]:
    """Compute quantile bin boundaries over a 1-D feature column."""
    quantiles = np.linspace(0.0, 100.0, n_bins + 1)
    boundaries: npt.NDArray[np.float64] = np.percentile(data, quantiles)
    return boundaries


def assign_bins(
    data: npt.NDArray[np.float64], boundaries: npt.NDArray[np.float64]
) -> npt.NDArray[np.int64]:
    """Map each value in data to a bin index in [0, len(boundaries)-2]."""
    indices: npt.NDArray[np.int64] = np.digitize(data, boundaries[1:-1]).astype(np.int64)
    return np.clip(indices, 0, len(boundaries) - 2).astype(np.int64)  # type: ignore[return-value]
