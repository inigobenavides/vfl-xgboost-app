# Domain Context: Federated XGBoost

## The problem

Two organizations hold complementary data about the same users — say, a payments app has transaction features and a bank has loan repayment history. Together their data would train a stronger fraud or credit model, but neither can legally or commercially share raw features. **Vertical federated learning** lets them jointly train without revealing those features.

## Why XGBoost specifically

1. It is a workhorse in fintech: interpretable, strong on tabular, easy to compare against.
2. The split-finding step is the right level of cryptographic challenge — non-trivial but tractable.
3. Existing libraries (FATE/SecureBoost, NVFlare) provide reference behaviors to compare against.

## The math, briefly

At each tree node, XGBoost picks the split `(feature j, threshold t)` that maximizes gain:

```
Gain = (G_L² / (H_L + λ)) + (G_R² / (H_R + λ)) − (G² / (H + λ)) − γ
```

where `G`, `H` are sums of per-sample gradients and hessians of the loss in the node.

In **vertical FL**, the guest holds `(g_i, h_i)` for every sample. The host knows, for each candidate split, which samples fall into the left vs right bucket — but must not see individual `g_i` or `h_i`, and the guest must not see the host's features.

**Our protocol (sketch).** The guest secret-shares `(g_i, h_i)` with the host. The host sums shares per candidate split bucket. The two parties combine shares to reveal only the aggregate `G_L`, `H_L` (and `G_R`, `H_R`), never individual gradients. The guest evaluates `Gain` on aggregates and selects the best split.

## Threat model

- **Honest-but-curious.** Parties follow the protocol but attempt to infer the other's data from messages observed.
- **Out of scope for MVP:** malicious parties, collusion with the coordinator, side-channel attacks, model-inversion attacks on the final model.

## Privacy primitives

- **Additive secret sharing.** Simple, fast, our MVP default. Built from scratch.
- **Paillier homomorphic encryption.** Industry-standard for SecureBoost-style protocols. Slower; planned as a pluggable backend in a later ADR.
- **Differential privacy** on aggregates and on the final model. Stretch goal.

## Useful references

- Cheng et al., *SecureBoost: A Lossless Federated Learning Framework* (the Ant Financial paper).
- Chen and Guestrin, *XGBoost: A Scalable Tree Boosting System* — for the gain formulation.
- FATE's SecureBoost implementation — for protocol comparison.
- Bonawitz et al., *Practical Secure Aggregation for Privacy-Preserving Machine Learning* — secret-sharing patterns.
