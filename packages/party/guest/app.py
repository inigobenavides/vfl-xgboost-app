"""Guest party FastAPI application factory."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
from fastapi import FastAPI

from packages.party.guest.routes import make_guest_router


def create_guest_app(
    labels: npt.NDArray[np.float64],
    n_bins: int = 256,
    lambda_reg: float = 1.0,
) -> FastAPI:
    """Create and return a configured FastAPI app for the guest party.

    Args:
        labels: Binary class labels (0 or 1) for all training samples.
        n_bins: Number of histogram bins (passed through for reference; the host
                owns the features and constructs its own bin boundaries).
        lambda_reg: XGBoost L2 regularisation term (lambda).

    Returns:
        A FastAPI application with /gradient_shares, /find_split, and
        /apply_split endpoints registered.
    """
    n_samples = len(labels)
    # All predictions initialised to 0.5 (log-odds = 0)
    predictions: npt.NDArray[np.float64] = np.full(n_samples, 0.5, dtype=np.float64)

    app = FastAPI(title="VFL Guest Party", version="0.1.0")
    router, _ = make_guest_router(labels=labels, predictions=predictions, lambda_reg=lambda_reg)
    app.include_router(router)
    return app
