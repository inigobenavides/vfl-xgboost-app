"""Trace writer — appends TraceEvent records to a JSON-lines file."""

from __future__ import annotations

import io
from pathlib import Path
from types import TracebackType
from typing import Self

from packages.shared.models import TraceEvent


class TraceWriter:
    """Append-only writer for trace events.

    Accepts any variant of the :data:`TraceEvent` discriminated union — protocol
    messages, tree-level events, narrative chapter markers, etc. Each event is
    serialised as a single JSON line (newline-delimited JSON) so the file grows
    incrementally without buffering the entire array in memory.

    Usage::

        with TraceWriter(trace_dir / "run_id.json") as tw:
            tw.append(event)
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._file: io.TextIOWrapper | None = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_open(self) -> io.TextIOWrapper:
        if self._file is None:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._file = self._path.open("a", encoding="utf-8")
        return self._file

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def append(self, event: TraceEvent) -> None:
        """Serialise *event* and append it as a JSON line."""
        f = self._ensure_open()
        f.write(event.model_dump_json())
        f.write("\n")
        f.flush()

    def close(self) -> None:
        """Flush and close the underlying file, if open."""
        if self._file is not None:
            self._file.close()
            self._file = None

    # ------------------------------------------------------------------
    # Context-manager support
    # ------------------------------------------------------------------

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        self.close()
