"""Deterministic baking of the canonical VFL trace consumed by the UI replay.

The output of this script is ``apps/ui/traces/uci-adult-canonical.jsonl`` —
the single curated training run that powers the v1 frontend demo. Running
the script twice at the same seed must produce byte-identical output.

The bake combines:

- A deterministic data loader (UCI Adult, ``train_test_split(random_state=42)``).
- A seeded RNG for ``AdditiveSSProtocol`` (no other RNG sources in the pipeline).
- A counter-based clock so timestamps are reproducible.
- A chapter-stamping ``TraceWriter`` subclass that emits ``ChapterMarkerEvent``
  records at the four narrative boundaries (``act1_start``, ``reconstruction``,
  ``act2_start``, ``final``).

The script's ``main`` entrypoint is intended to be run as
``python -m scripts.bake_canonical_trace``. The pure ``bake`` function is the
unit the determinism test exercises against a small synthetic dataset.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from fxgb.demo import LAMBDA_REG, LR, MAX_DEPTH, N_BINS, N_TREES, ClockFn, run_vfl
from packages.coordinator.trace import TraceWriter
from packages.shared.models import (
    ChapterMarkerEvent,
    ChapterName,
    ReconstructionAggregateEvent,
    TraceEvent,
    TreeStartEvent,
)
from packages.xgb_core.baseline import HOST_FEATURES, load_adult

CANONICAL_TRACE_PATH = Path("apps/ui/traces/uci-adult-canonical.jsonl")
CANONICAL_SEED = 42
CANONICAL_BASE_TIME = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)
_DEFAULT_CACHE = Path.home() / ".cache" / "fxgb"


# ---------------------------------------------------------------------------
# Inputs the bake needs from a data loader
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BakeData:
    x_train: npt.NDArray[np.float64]
    y_train: npt.NDArray[np.float64]
    x_test: npt.NDArray[np.float64]
    y_test: npt.NDArray[np.float64]
    feature_names: list[str]


DataLoaderFn = Callable[[], BakeData]


def _uci_adult_loader(cache_dir: Path = _DEFAULT_CACHE) -> BakeData:
    """Load UCI Adult and return the canonical 80/20 train/test split."""
    from sklearn.model_selection import train_test_split  # type: ignore[import-untyped]

    cache_dir.mkdir(parents=True, exist_ok=True)
    features_np, labels_np = load_adult(cache_dir)
    split_result: Any = train_test_split(  # type: ignore[reportUnknownVariableType]
        features_np, labels_np, test_size=0.2, random_state=42
    )
    return BakeData(
        x_train=np.asarray(split_result[0], dtype=np.float64),
        x_test=np.asarray(split_result[1], dtype=np.float64),
        y_train=np.asarray(split_result[2], dtype=np.float64),
        y_test=np.asarray(split_result[3], dtype=np.float64),
        feature_names=HOST_FEATURES,
    )


# ---------------------------------------------------------------------------
# Deterministic clock
# ---------------------------------------------------------------------------


def make_deterministic_clock(
    base: datetime = CANONICAL_BASE_TIME,
    step_microseconds: int = 1,
) -> ClockFn:
    """A clock that emits monotonically increasing, reproducible timestamps."""
    counter = [0]
    step = timedelta(microseconds=step_microseconds)

    def now() -> datetime:
        counter[0] += 1
        return base + step * counter[0]

    return now


# ---------------------------------------------------------------------------
# Chapter-stamping writer
# ---------------------------------------------------------------------------


class ChapterStampingWriter(TraceWriter):
    """TraceWriter subclass that injects ChapterMarkerEvent records at narrative boundaries.

    Chapters mark the *start* of their region, so they are emitted just before
    the triggering event:

    - ``act1_start`` — before ``TreeStartEvent(tree_index=0)``.
    - ``reconstruction`` — before ``ReconstructionAggregateEvent`` (canonical node).
    - ``act2_start`` — before ``TreeStartEvent(tree_index=1)``.
    - ``final`` — explicitly via :meth:`stamp_final`, after the last training event.
    """

    def __init__(self, path: Path, now: ClockFn) -> None:
        super().__init__(path)
        self._now = now
        self._stamped: set[ChapterName] = set()

    def _stamp(self, chapter: ChapterName) -> None:
        if chapter in self._stamped:
            return
        super().append(ChapterMarkerEvent(chapter=chapter, timestamp=self._now()))
        self._stamped.add(chapter)

    def append(self, event: TraceEvent) -> None:
        if isinstance(event, TreeStartEvent):
            if event.tree_index == 0:
                self._stamp("act1_start")
            elif event.tree_index == 1:
                self._stamp("act2_start")
        elif isinstance(event, ReconstructionAggregateEvent):
            self._stamp("reconstruction")
        super().append(event)

    def stamp_final(self) -> None:
        """Emit the ``final`` chapter marker. Call after training completes."""
        self._stamp("final")


# ---------------------------------------------------------------------------
# Public bake entrypoint
# ---------------------------------------------------------------------------


def bake(
    output_path: Path,
    n_trees: int = N_TREES,
    max_depth: int = MAX_DEPTH,
    n_bins: int = N_BINS,
    lr: float = LR,
    lambda_reg: float = LAMBDA_REG,
    seed: int = CANONICAL_SEED,
    base_time: datetime = CANONICAL_BASE_TIME,
    data_loader: DataLoaderFn | None = None,
) -> None:
    """Bake a deterministic VFL training trace to *output_path*.

    Two consecutive calls with the same arguments produce byte-identical files.
    """
    loader: DataLoaderFn = data_loader if data_loader is not None else _uci_adult_loader
    data = loader()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    now = make_deterministic_clock(base=base_time)
    rng = np.random.default_rng(seed)

    with ChapterStampingWriter(output_path, now) as writer:
        run_vfl(
            x_train=data.x_train,
            y_train=data.y_train,
            x_test=data.x_test,
            feature_names=data.feature_names,
            n_trees=n_trees,
            max_depth=max_depth,
            n_bins=n_bins,
            lr=lr,
            lambda_reg=lambda_reg,
            y_test=data.y_test,
            writer=writer,
            now=now,
            rng=rng,
        )
        writer.stamp_final()


def main() -> None:
    """CLI entrypoint: bake the canonical UCI-Adult trace at the committed path."""
    bake(output_path=CANONICAL_TRACE_PATH)
    print(f"Wrote canonical trace to {CANONICAL_TRACE_PATH}")


if __name__ == "__main__":
    main()
