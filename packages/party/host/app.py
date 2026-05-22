from __future__ import annotations

import json
import tempfile
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import numpy.typing as npt
from fastapi import FastAPI

from packages.party.common.binning import compute_bin_boundaries
from packages.party.host.routes import router
from packages.party.host.state import HostState

__all__ = ["HostState", "create_host_app"]


def create_host_app(
    features: npt.NDArray[np.float64],
    feature_names: list[str],
    n_bins: int = 256,
) -> FastAPI:
    """Factory that wires up a host-party FastAPI application.

    At lifespan startup the app computes quantile bin boundaries for every
    feature column and serialises them to a temporary JSON file so they can
    be inspected or recovered after a restart.

    Args:
        features: Float array of shape (n_samples, n_features).  The host's
            non-label feature matrix.
        feature_names: Names for each column, used as feature_id keys.
        n_bins: Number of histogram bins (default 256).

    Returns:
        A configured FastAPI application ready to be served.
    """
    if features.ndim != 2:  # noqa: PLR2004
        raise ValueError(f"features must be 2-D, got shape {features.shape}")
    if len(feature_names) != features.shape[1]:
        raise ValueError(
            f"feature_names length {len(feature_names)} != features.shape[1] {features.shape[1]}"
        )

    # Capture the arguments in a closure so the lifespan can access them.
    _features = features
    _feature_names = list(feature_names)
    _n_bins = n_bins

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        # Compute bin boundaries once at startup.
        bin_boundaries: dict[str, npt.NDArray[np.float64]] = {}
        for col_idx, feat_name in enumerate(_feature_names):
            col: npt.NDArray[np.float64] = _features[:, col_idx]
            bin_boundaries[feat_name] = compute_bin_boundaries(col, _n_bins)

        # Persist boundaries to a JSON file for auditability.
        edges_path = Path(tempfile.gettempdir()) / "host_bin_edges.json"
        serialisable: dict[str, list[float]] = {
            name: boundaries.tolist()
            for name, boundaries in bin_boundaries.items()
        }
        edges_path.write_text(json.dumps(serialisable, indent=2))

        # Shared mutable state for the lifetime of the app.
        app.state.host_state = HostState(
            features=_features,
            feature_names=_feature_names,
            bin_boundaries=bin_boundaries,
            n_bins=_n_bins,
        )

        yield

        # Cleanup (nothing persistent to release).

    app = FastAPI(title="VFL Host Party", lifespan=lifespan)
    app.include_router(router)
    return app
