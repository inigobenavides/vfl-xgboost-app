"""Host party service entry point for Docker Compose.

Loads UCI Adult features (training split), then serves the host FastAPI app.
PORT and DATA_CACHE are configurable via environment variables.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import uvicorn

PORT: int = int(os.environ.get("HOST_PORT", "8002"))
DATA_CACHE: Path = Path(os.environ.get("DATA_CACHE", str(Path.home() / ".cache" / "fxgb")))


def main() -> None:
    from sklearn.model_selection import train_test_split  # type: ignore[import-untyped]

    from packages.party.host.app import create_host_app
    from packages.xgb_core.baseline import HOST_FEATURES, load_adult

    DATA_CACHE.mkdir(parents=True, exist_ok=True)
    features_np, labels_np = load_adult(DATA_CACHE)

    split_result: Any = train_test_split(  # type: ignore[reportUnknownVariableType]
        features_np, labels_np, test_size=0.2, random_state=42
    )
    x_train: npt.NDArray[np.float64] = np.asarray(split_result[0], dtype=np.float64)

    app = create_host_app(features=x_train, feature_names=HOST_FEATURES)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
