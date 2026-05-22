"""Determinism test for the canonical trace bake script."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from scripts.bake_canonical_trace import BakeData, bake


def _synthetic_loader() -> BakeData:
    rng = np.random.default_rng(0)
    x = rng.normal(size=(200, 3)).astype(np.float64)
    y = (x[:, 0] > 0).astype(np.float64)
    return BakeData(
        x_train=x[:160],
        y_train=y[:160],
        x_test=x[160:],
        y_test=y[160:],
        feature_names=["f0", "f1", "f2"],
    )


def test_bake_is_deterministic(tmp_path: Path) -> None:
    """Two consecutive bake() calls with the same seed produce byte-identical output.

    Both calls run in the same process so numpy's SIMD reduction order is stable.
    Cross-process runs may differ at the sub-ulp level (last 1–2 float64 digits),
    which is acceptable for demo correctness.
    """
    path1 = tmp_path / "trace1.jsonl"
    path2 = tmp_path / "trace2.jsonl"

    bake(path1, n_trees=2, max_depth=2, n_bins=8, data_loader=_synthetic_loader)
    bake(path2, n_trees=2, max_depth=2, n_bins=8, data_loader=_synthetic_loader)

    assert path1.read_bytes() == path2.read_bytes()


def test_bake_output_is_valid_jsonl(tmp_path: Path) -> None:
    """Every line in the baked output is a parseable TraceEvent."""
    import json

    from packages.shared.models import TraceEventAdapter

    path = tmp_path / "trace.jsonl"
    bake(path, n_trees=2, max_depth=2, n_bins=8, data_loader=_synthetic_loader)

    lines = path.read_text().splitlines()
    assert len(lines) > 0

    for line in lines:
        raw = json.loads(line)
        TraceEventAdapter.validate_python(raw)


def test_bake_contains_chapter_markers(tmp_path: Path) -> None:
    """Baked trace includes all four chapter markers in order."""
    import json

    path = tmp_path / "trace.jsonl"
    bake(path, n_trees=2, max_depth=2, n_bins=8, data_loader=_synthetic_loader)

    chapters = [
        json.loads(line)["chapter"]
        for line in path.read_text().splitlines()
        if json.loads(line).get("type") == "chapter_marker"
    ]

    assert chapters == ["act1_start", "reconstruction", "act2_start", "final"]
