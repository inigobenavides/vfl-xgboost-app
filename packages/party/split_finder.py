"""Split-finding logic for vertical federated XGBoost.

Two public functions:

- ``scan_best_split`` — pure gain-scanning over already-reconstructed cumulative
  histograms.  Used by the guest HTTP endpoint, which has already done the
  secret-sharing reconstruction step.

- ``find_best_split`` — full in-process helper that handles secret-sharing,
  histogram aggregation, reconstruction, and then delegates the scan to
  ``scan_best_split``.  Used by ``fxgb/demo.py`` (in-process simulation).

Both share the same gain formula and h≤0 guard so there is exactly one
source of truth for the split-finding math.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from packages.crypto.additive_ss import AdditiveSSProtocol
from packages.party.common.binning import assign_bins
from packages.shared.models import SplitDecision


def scan_best_split(
    g_hists: dict[str, npt.NDArray[np.float64]],
    h_hists: dict[str, npt.NDArray[np.float64]],
    n_bins: int,
    lambda_reg: float,
) -> SplitDecision | None:
    """Find the best (feature, threshold_bin) by scanning all candidates.

    Parameters
    ----------
    g_hists:
        Mapping from feature_id to a cumulative gradient histogram of length
        ``n_bins``.  ``g_hists[f][k]`` is the cumulative sum of gradients for
        samples in bins 0..k.
    h_hists:
        Same structure for hessians.
    n_bins:
        Number of histogram bins (length of each histogram array).
    lambda_reg:
        L2 regularisation term added to each denominator.

    Returns
    -------
    ``SplitDecision`` with the best gain, or ``None`` when no split achieves a
    strictly positive gain.  Candidates where ``h_left <= 0`` or
    ``h_right <= 0`` are skipped to avoid division by near-zero denominators.
    """
    best_gain = 0.0
    best_feature_id = ""
    best_threshold = 0

    for feature_id, g_hist in g_hists.items():
        h_hist = h_hists[feature_id]
        g_total = float(g_hist[-1])
        h_total = float(h_hist[-1])

        for k in range(n_bins - 1):
            g_left = float(g_hist[k])
            h_left = float(h_hist[k])
            g_right = g_total - g_left
            h_right = h_total - h_left

            if h_left <= 0.0 or h_right <= 0.0:
                continue

            gain = (
                g_left**2 / (h_left + lambda_reg)
                + g_right**2 / (h_right + lambda_reg)
                - g_total**2 / (h_total + lambda_reg)
            )
            if gain > best_gain:
                best_gain = gain
                best_feature_id = feature_id
                best_threshold = k

    if not best_feature_id:
        return None
    return SplitDecision(
        feature_id=best_feature_id,
        threshold=float(best_threshold),
        gain=best_gain,
    )


def find_best_split(
    proto: AdditiveSSProtocol,
    g: npt.NDArray[np.float64],
    h: npt.NDArray[np.float64],
    sample_indices: npt.NDArray[np.int64],
    features: npt.NDArray[np.float64],
    feature_names: list[str],
    bin_boundaries: dict[str, npt.NDArray[np.float64]],
    n_bins: int,
    lambda_reg: float,
) -> SplitDecision | None:
    """Secret-share gradients, aggregate histograms, and find the best split.

    This is the in-process (no-HTTP) version used by ``fxgb/demo.py``.  It
    simulates both the guest and host sides locally so that the federated
    protocol is exercised without network round-trips.

    Parameters
    ----------
    proto:
        The ``AdditiveSSProtocol`` instance to use for sharing and
        reconstruction.
    g:
        Per-sample gradients for the *entire* dataset (shape ``(N,)``).
    h:
        Per-sample hessians for the *entire* dataset (shape ``(N,)``).
    sample_indices:
        Indices of samples that belong to the current tree node.
    features:
        Feature matrix of shape ``(N, len(feature_names))``.
    feature_names:
        Column names aligned with ``features``.
    bin_boundaries:
        Mapping from feature name to its quantile bin boundary array.
    n_bins:
        Number of histogram bins.
    lambda_reg:
        L2 regularisation term.

    Returns
    -------
    ``SplitDecision`` or ``None`` (no positive-gain split).
    """
    g_i = g[sample_indices]
    h_i = h[sample_indices]

    # Guest secret-shares the node's gradients/hessians.
    g_share_a, g_share_b = proto.share(g_i)
    h_share_a, h_share_b = proto.share(h_i)

    g_hists: dict[str, npt.NDArray[np.float64]] = {}
    h_hists: dict[str, npt.NDArray[np.float64]] = {}

    for col_idx, feat_name in enumerate(feature_names):
        col: npt.NDArray[np.float64] = features[sample_indices, col_idx]
        bucket_indices = assign_bins(col, bin_boundaries[feat_name])

        # Host aggregates share_a; guest aggregates share_b.
        g_hist_a = proto.aggregate(g_share_a, bucket_indices, n_bins)
        h_hist_a = proto.aggregate(h_share_a, bucket_indices, n_bins)
        g_hist_b = proto.aggregate(g_share_b, bucket_indices, n_bins)
        h_hist_b = proto.aggregate(h_share_b, bucket_indices, n_bins)

        # Guest reconstructs the full cumulative histogram.
        g_hists[feat_name] = proto.reconstruct(g_hist_a, g_hist_b)
        h_hists[feat_name] = proto.reconstruct(h_hist_a, h_hist_b)

    return scan_best_split(g_hists, h_hists, n_bins, lambda_reg)
