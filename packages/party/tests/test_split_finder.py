"""Tests for packages/party/split_finder.py.

Three tests:

1. ``test_constant_feature_returns_none`` — when all samples land in a single
   bin there is no split candidate with both h_left > 0 and h_right > 0, so
   ``scan_best_split`` must return ``None``.

2. ``test_zero_hessian_no_division_error`` — histograms where h_left or
   h_right is zero for every candidate do not raise ``ZeroDivisionError``
   and the function returns ``None``.

3. ``test_two_bin_hand_check`` — two features, two bins each, specific g/h
   values. The expected gain is computed by hand and the result must match
   within 1e-3.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from packages.party.split_finder import scan_best_split

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_cumulative(
    values: list[float],
) -> npt.NDArray[np.float64]:
    """Return a 1-D cumulative-sum array (same shape as values)."""
    return np.cumsum(np.array(values, dtype=np.float64))


# ---------------------------------------------------------------------------
# Test 1: Constant feature → all samples in one bin → no valid split
# ---------------------------------------------------------------------------


def test_constant_feature_returns_none() -> None:
    """All mass is in a single bin so every candidate split has h_left=0 or
    h_right=0.  ``scan_best_split`` should return ``None``."""
    n_bins = 4

    # All gradient / hessian mass sits in bin 0; bins 1-3 are empty.
    # Cumulative histograms:  [total, total, total, total]
    g_cum = np.array([5.0, 5.0, 5.0, 5.0], dtype=np.float64)
    h_cum = np.array([3.0, 3.0, 3.0, 3.0], dtype=np.float64)

    result = scan_best_split(
        g_hists={"f0": g_cum},
        h_hists={"f0": h_cum},
        n_bins=n_bins,
        lambda_reg=1.0,
    )
    assert result is None, f"Expected None for constant feature, got {result}"


# ---------------------------------------------------------------------------
# Test 2: h≤0 guard — no ZeroDivisionError, returns None
# ---------------------------------------------------------------------------


def test_zero_hessian_no_division_error() -> None:
    """Construct cumulative histograms where h_left or h_right is exactly 0
    for every candidate threshold.  The function must not raise and must
    return ``None`` (no positive-gain split)."""
    n_bins = 3
    lambda_reg = 1.0

    # h cumulative = [0, 0, 2]: h_left=0 for k=0,1; h_right=0 would only
    # happen if h_left == h_total, which is not the case here.  Let us
    # construct a case where h_right is 0 for k=1 (the last scannable bin):
    # cumulative h = [2, 2, 2] → h_right = 0 for every k.
    g_cum = np.array([1.0, 2.0, 3.0], dtype=np.float64)
    h_cum = np.array([2.0, 2.0, 2.0], dtype=np.float64)

    # k=0: h_left=2, h_right=0 → skip
    # k=1: h_left=2, h_right=0 → skip
    # → no valid candidate → None

    result = scan_best_split(
        g_hists={"f0": g_cum},
        h_hists={"f0": h_cum},
        n_bins=n_bins,
        lambda_reg=lambda_reg,
    )
    assert result is None, f"Expected None when h_right=0 for all candidates, got {result}"


# ---------------------------------------------------------------------------
# Test 3: Two-bin hand-check
# ---------------------------------------------------------------------------


def test_two_bin_hand_check() -> None:
    """Two features, two bins each.  The gain is computed by hand and the
    function result must match within 1e-3 tolerance.

    Setup
    -----
    n_bins = 2, lambda_reg = 1.0

    Feature "f0"  (the better split):
        bin 0 mass: g=1.0, h=2.0
        bin 1 mass: g=3.0, h=4.0
        cumulative g = [1.0, 4.0],  cumulative h = [2.0, 6.0]
        Only candidate: k=0 → g_left=1, h_left=2, g_right=3, h_right=4
        gain_f0 = 1²/(2+1) + 3²/(4+1) − 4²/(6+1)
                = 1/3 + 9/5 − 16/7
                ≈ 0.3333 + 1.8000 − 2.2857
                ≈ −0.1524   (negative!)

    Feature "f1"  (positive gain):
        bin 0 mass: g=−1.0, h=1.0
        bin 1 mass: g=4.0,  h=1.0
        cumulative g = [−1.0, 3.0],  cumulative h = [1.0, 2.0]
        Only candidate: k=0 → g_left=−1, h_left=1, g_right=4, h_right=1
        gain_f1 = (−1)²/(1+1) + 4²/(1+1) − 3²/(2+1)
                = 1/2 + 16/2 − 9/3
                = 0.5 + 8.0 − 3.0
                = 5.5
    """
    n_bins = 2
    lambda_reg = 1.0

    g_hists = {
        "f0": np.array([1.0, 4.0], dtype=np.float64),
        "f1": np.array([-1.0, 3.0], dtype=np.float64),
    }
    h_hists = {
        "f0": np.array([2.0, 6.0], dtype=np.float64),
        "f1": np.array([1.0, 2.0], dtype=np.float64),
    }

    expected_gain = 5.5
    expected_feature = "f1"
    expected_threshold = 0

    result = scan_best_split(
        g_hists=g_hists,
        h_hists=h_hists,
        n_bins=n_bins,
        lambda_reg=lambda_reg,
    )

    assert result is not None, "Expected a SplitDecision, got None"
    assert result.feature_id == expected_feature, (
        f"Expected feature_id={expected_feature!r}, got {result.feature_id!r}"
    )
    assert int(result.threshold) == expected_threshold, (
        f"Expected threshold={expected_threshold}, got {result.threshold}"
    )
    assert abs(result.gain - expected_gain) < 1e-3, (
        f"Expected gain≈{expected_gain}, got {result.gain}"
    )
