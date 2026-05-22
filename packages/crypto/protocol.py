from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
import numpy.typing as npt


class Protocol[ShareT](ABC):
    """Abstract privacy backend — all VFL crypto routes through this interface.

    The concrete share type (ShareT) is opaque to callers:
    - AdditiveSSProtocol uses NDArray[np.int64]
    - A future Paillier backend would use a vector of ciphertexts
    """

    @abstractmethod
    def share(
        self, values: npt.NDArray[np.float64]
    ) -> tuple[ShareT, ShareT]:
        """Split float values into two additive shares.

        Neither share alone reveals anything about values.
        """
        ...

    @abstractmethod
    def aggregate(
        self,
        share: ShareT,
        bucket_indices: npt.NDArray[np.int64],
        n_buckets: int,
    ) -> ShareT:
        """Compute a cumulative histogram share over n_buckets bins.

        bucket_indices[i] is the bin (0..n_buckets-1) for sample i.
        Returns a share of shape (n_buckets,) where entry k is the
        cumulative sum of share values for samples with index <= k.
        """
        ...

    @abstractmethod
    def reconstruct(
        self, share_a: ShareT, share_b: ShareT
    ) -> npt.NDArray[np.float64]:
        """Combine two shares to recover the original float values."""
        ...
