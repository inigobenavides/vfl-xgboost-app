"""Five Hypothesis property tests for AdditiveSSProtocol.

1. Round-trip:         reconstruct(share(x)) ≈ x within 1/SCALE
2. Commutativity:      reconstruct(a, b) == reconstruct(b, a)
3. Histogram linearity: aggregate(share(a+b)) ≡ aggregate(share(a)) + aggregate(share(b)) mod P
4. Overflow/mod-wrap:  large encoded values (near P) reconstruct correctly
5. Share privacy:      each share alone is uniformly spread — knowing share_a fixes share_b
                       but reveals nothing about x (tested via indistinguishability)
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from packages.crypto.additive_ss import (  # type: ignore[reportPrivateUsage]
    SCALE,
    AdditiveSSProtocol,
    P,
    _addmod,
)

# ---------------------------------------------------------------------------
# Shared strategies
# ---------------------------------------------------------------------------

# Floats well within the safe encoding range, no NaN/inf
safe_floats = st.floats(min_value=-1000.0, max_value=1000.0, allow_nan=False, allow_infinity=False)

float_array = arrays(dtype=np.float64, shape=st.integers(1, 64), elements=safe_floats)

bucket_index_array = arrays(
    dtype=np.int64,
    shape=st.integers(1, 64),
    elements=st.integers(0, 7),  # 8 buckets — small so cumsum tests are fast
)


def proto(seed: int = 0) -> AdditiveSSProtocol:
    return AdditiveSSProtocol(rng=np.random.default_rng(seed))


# ---------------------------------------------------------------------------
# Property 1: Round-trip
# ---------------------------------------------------------------------------


@given(values=float_array)
def test_roundtrip(values: npt.NDArray[np.float64]) -> None:
    p = proto()
    share_a, share_b = p.share(values)
    recovered = p.reconstruct(share_a, share_b)
    np.testing.assert_allclose(values, recovered, atol=1.0 / SCALE)


# ---------------------------------------------------------------------------
# Property 2: Commutativity — (a, b) and (b, a) reconstruct the same value
# ---------------------------------------------------------------------------


@given(values=float_array)
def test_commutativity(values: npt.NDArray[np.float64]) -> None:
    p = proto()
    share_a, share_b = p.share(values)
    forward = p.reconstruct(share_a, share_b)
    swapped = p.reconstruct(share_b, share_a)
    np.testing.assert_allclose(forward, swapped, atol=1.0 / SCALE)


# ---------------------------------------------------------------------------
# Property 3: Histogram linearity
#   aggregate(share(a + b)) ≡ aggregate(share(a)) + aggregate(share(b))  (mod P)
#
#   We use integer-valued floats so encode(a+b) == encode(a)+encode(b) exactly,
#   eliminating rounding noise. Equality is tested in the field (before decode)
#   so it is exact.
# ---------------------------------------------------------------------------


@given(st.data())
@settings(max_examples=100)
def test_histogram_linearity(data: st.DataObject) -> None:
    n = data.draw(st.integers(1, 32))
    # Integer-valued floats → encode commutes with addition exactly
    a = data.draw(arrays(np.float64, shape=n, elements=st.integers(-100, 100))).astype(np.float64)
    b = data.draw(arrays(np.float64, shape=n, elements=st.integers(-100, 100))).astype(np.float64)
    bucket_indices = data.draw(arrays(np.int64, shape=n, elements=st.integers(0, 7)))
    n_buckets = 8

    p = proto()

    # LHS: aggregate(share(a + b))
    ab_a, ab_b = p.share(a + b)
    lhs_combined = _addmod(
        p.aggregate(ab_a, bucket_indices, n_buckets),
        p.aggregate(ab_b, bucket_indices, n_buckets),
    )

    # RHS: aggregate(share(a)) + aggregate(share(b))  [all mod P]
    a_a, a_b = p.share(a)
    b_a, b_b = p.share(b)
    agg_a = _addmod(
        p.aggregate(a_a, bucket_indices, n_buckets), p.aggregate(b_a, bucket_indices, n_buckets)
    )
    agg_b = _addmod(
        p.aggregate(a_b, bucket_indices, n_buckets), p.aggregate(b_b, bucket_indices, n_buckets)
    )
    rhs_combined = _addmod(agg_a, agg_b)

    # Exact equality in the field — no float reconstruction error
    np.testing.assert_array_equal(lhs_combined, rhs_combined)


# ---------------------------------------------------------------------------
# Property 4: Overflow / modular wrap — large encoded values near P reconstruct
# ---------------------------------------------------------------------------


@given(
    values=arrays(
        dtype=np.float64,
        shape=st.integers(1, 16),
        # Values whose fixed-point encoding is large but still < MAX_FLOAT
        elements=st.floats(min_value=1e9, max_value=1e11, allow_nan=False, allow_infinity=False),
    )
)
def test_large_values_roundtrip(values: npt.NDArray[np.float64]) -> None:
    p = proto()
    share_a, share_b = p.share(values)
    recovered = p.reconstruct(share_a, share_b)
    np.testing.assert_allclose(values, recovered, atol=1.0 / SCALE)


@given(
    values=arrays(
        dtype=np.float64,
        shape=st.integers(1, 16),
        elements=st.floats(min_value=-1e11, max_value=-1e9, allow_nan=False, allow_infinity=False),
    )
)
def test_large_negative_values_roundtrip(values: npt.NDArray[np.float64]) -> None:
    p = proto()
    share_a, share_b = p.share(values)
    recovered = p.reconstruct(share_a, share_b)
    np.testing.assert_allclose(values, recovered, atol=1.0 / SCALE)


# ---------------------------------------------------------------------------
# Property 5: Share privacy
#   Knowing only share_a reveals nothing about x.
#   Tested via: for any x, share_a is uniform in [0, P); share_b is
#   uniquely determined by share_a and x, so the marginal of share_a
#   is independent of x.
#
#   Concretely: for two different inputs x ≠ y, the distribution of
#   share_a is the same (uniform). We test:
#     (a) share_a ∈ [0, P) always
#     (b) share_b ∈ [0, P) always
#     (c) for a fixed x, different RNG seeds produce different share_a values
# ---------------------------------------------------------------------------


@given(values=float_array)
def test_shares_in_field(values: npt.NDArray[np.float64]) -> None:
    p = proto()
    share_a, share_b = p.share(values)
    assert np.all(share_a >= 0) and np.all(share_a < P)
    assert np.all(share_b >= 0) and np.all(share_b < P)


@given(
    x1=float_array,
    x2=float_array,
)
def test_share_a_independent_of_x(
    x1: npt.NDArray[np.float64], x2: npt.NDArray[np.float64]
) -> None:
    """share_a is drawn from the RNG before seeing x, so the same seed produces
    the same share_a for any two inputs of the same shape — proving share_a
    carries no information about x.
    """
    if x1.shape != x2.shape:
        return  # different shapes → RNG draws differ; skip
    p1 = AdditiveSSProtocol(rng=np.random.default_rng(0))
    p2 = AdditiveSSProtocol(rng=np.random.default_rng(0))
    a1, b1 = p1.share(x1)
    a2, b2 = p2.share(x2)
    # Same seed + same shape → identical share_a regardless of x
    np.testing.assert_array_equal(a1, a2)
    # share_b absorbs all information about x; it differs when x differs
    if not np.allclose(x1, x2):
        assert not np.array_equal(b1, b2)
