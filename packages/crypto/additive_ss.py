from __future__ import annotations

import numpy as np
import numpy.typing as npt

from packages.crypto.protocol import Protocol

# Mersenne prime — fast modular reduction, shares fit in int64
P: int = (2**61) - 1

# Fixed-point scale: 1 ULP = 1/SCALE ≈ 9.5e-7
SCALE: int = 2**20

# Safe float range: |x| must satisfy round(x * SCALE) < P
MAX_FLOAT: float = P / SCALE  # ≈ 2.3e12


class AdditiveSSProtocol(Protocol[npt.NDArray[np.int64]]):
    """Additive secret sharing over GF(P) with fixed-point float encoding.

    share(x) splits x into (a, b) where a + b ≡ encode(x) (mod P).
    Neither share alone carries any information about x.
    """

    def __init__(self, rng: np.random.Generator | None = None) -> None:
        self._rng = rng if rng is not None else np.random.default_rng()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def share(
        self, values: npt.NDArray[np.float64]
    ) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]:
        encoded = self._encode(values)
        share_a = self._rng.integers(0, P, size=encoded.shape, dtype=np.int64)
        share_b = _submod(encoded, share_a)
        return share_a, share_b

    def aggregate(
        self,
        share: npt.NDArray[np.int64],
        bucket_indices: npt.NDArray[np.int64],
        n_buckets: int,
    ) -> npt.NDArray[np.int64]:
        # Accumulate using Python int to avoid int64 overflow when many
        # shares (each < P ≈ 2^61) land in the same bucket.
        hist: list[int] = [0] * n_buckets
        for s, b in zip(share.tolist(), bucket_indices.tolist(), strict=False):
            hist[int(b)] = (hist[int(b)] + int(s)) % P
        return _cumsum_modp(np.array(hist, dtype=np.int64))

    def reconstruct(
        self,
        share_a: npt.NDArray[np.int64],
        share_b: npt.NDArray[np.int64],
    ) -> npt.NDArray[np.float64]:
        combined = _addmod(share_a, share_b)
        return self._decode(combined)

    # ------------------------------------------------------------------
    # Fixed-point helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _encode(values: npt.NDArray[np.float64]) -> npt.NDArray[np.int64]:
        return (np.round(values * SCALE).astype(np.int64)) % P  # type: ignore[return-value]

    @staticmethod
    def _decode(encoded: npt.NDArray[np.int64]) -> npt.NDArray[np.float64]:
        # Elements in (P//2, P) represent negative values in two's-complement mod P
        signed: npt.NDArray[np.int64] = np.where(  # type: ignore[assignment]
            encoded > P // 2, encoded - np.int64(P), encoded
        )
        return signed.astype(np.float64) / SCALE


# ------------------------------------------------------------------
# Modular arithmetic helpers (module-private)
# ------------------------------------------------------------------


def _modp(a: npt.NDArray[np.int64]) -> npt.NDArray[np.int64]:
    return a % P  # type: ignore[return-value]


def _addmod(
    a: npt.NDArray[np.int64], b: npt.NDArray[np.int64]
) -> npt.NDArray[np.int64]:
    # a, b < P < 2^61; sum < 2^62 < INT64_MAX — no overflow
    return _modp(a + b)


def _submod(
    a: npt.NDArray[np.int64], b: npt.NDArray[np.int64]
) -> npt.NDArray[np.int64]:
    return _modp(a - b + P)


def _cumsum_modp(hist: npt.NDArray[np.int64]) -> npt.NDArray[np.int64]:
    """Cumulative sum of hist entries modulo P, element by element."""
    result = np.empty_like(hist)
    acc: int = 0
    for i in range(len(hist)):
        acc = (acc + int(hist[i])) % P
        result[i] = np.int64(acc)
    return result
