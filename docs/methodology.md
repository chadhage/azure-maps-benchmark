# Measurement methodology

## Decision to support

Determine whether Azure Maps is useful for resolving Zava's incomplete or difficult address inputs under an agreed operational workflow. This POC measures geographic matching, not postal deliverability or compliance.

No real dataset has been supplied and no live service observations have been collected in this repository. The fixture oracle is invented, including its negative-control behavior. It intentionally demonstrates both errors and successes without asserting that Azure would return those responses.

## Before the first live experiment

1. Agree the unit of success: building, parcel, entrance, street, locality, or exact postal address. Matching a building must not imply an apartment/unit was identified.
2. Establish independent expected addresses/coordinates from an approved source **before** observing provider results. Record source and verification date in `expected.source`.
3. Agree distance tolerances per case, ideally by granularity/country. Coordinate ordering is `[longitude, latitude]`, WGS84; the comparison is great-circle distance in meters. Do not choose tolerances after inspecting misses.
4. Create disjoint exploration and holdout sets. Avoid counting variations of the same base address as independent evidence. Preserve a mapping externally if necessary; do not expose sensitive identifiers publicly.
5. Agree target top-1/top-k accuracy, minimum labelled n by category/country, maximum error/review rate, latency budget and commercial request budget. Targets remain **TBD with Zava**, not hardcoded to make the POC pass.
6. Confirm data-processing authorization, endpoint geography, logging/retention settings, API licensing, and current service pricing. This repository does not certify residency or quote a deployment price.

## Suggested challenge matrix

| Category | Examples to include | Important failure mode |
| --- | --- | --- |
| Complete controls | Known valid, complete inputs | Baseline errors |
| Partial | Missing street suffix/house number/locality | Coarse result mistaken for a complete address |
| Typos | Transpositions, omitted characters | Plausible wrong street |
| Missing components | Missing postal code/state/country | Cross-region confusion |
| Ambiguous | Common streets and duplicate place names | Wrong top-1 despite high confidence |
| Unit detail | Suites, floors and apartments | Building-level success overclaimed |
| International | Approved countries, native scripts, diacritics | Coverage and formatting differences |
| Negative controls | Independently verified unresolvable input | False positive candidate |

Use representative approved data, not only famous landmarks or service-friendly examples. Categories are analyst-defined and may themselves contain sensitive information. Detailed exports include them; default aggregate exports do not.

## Strategies and fairness

Both current adapters use the pinned Search REST API `2026-01-01`:

1. **Free-form geocoding:** query and optional input location hint. In this API, `countryRegion` must not accompany `query`; the application therefore does not send it. If country context is part of the address as received, keep it in the input query rather than silently appending it in code.
2. **Address autocomplete:** query prefix, address-only entity group, optional input country and optional input location hint; if no hint is available, a world bounding box explicitly satisfies the API's spatial-context requirement.

Autocomplete is designed for prefixes and suggestion workflows; it is not guaranteed to outperform geocoding for arbitrary malformed addresses. A world bounding box is a low-information baseline, not a substitute for useful geographic context. The application does not automatically filter geocode results to address entities.

The two strategies differ in entity filtering and contextual parameters. Their headline difference is **not** an isolated effect of API choice. For a fairer investigation, run matched strata with equivalent known input context, document filters, or run one strategy at a time. Do not use expected/truth country or coordinates to enrich the input.

Raw input query text is trimmed but not corrected, expanded or rewritten by an LLM. This makes the baseline interpretable and avoids inventing house numbers or country information. Consider separately labelled preprocessing experiments only after establishing a baseline.

## Correctness rules

- Text is normalized with Unicode NFKC, case-folding, collapsed whitespace and periods/commas treated as separators.
- The evaluator does **not** equate `St` with `Street`/`Saint`, transliterate scripts, drop diacritics, remove unit details or strip house numbers. Conservative equality can yield false negatives; inspect them rather than broadening rules until a score improves.
- All supplied expected address components must match. Missing returned components fail those criteria.
- If coordinates are supplied as truth, the selected Display geocode point (or feature geometry) must be within the explicit tolerance. If both address and position criteria exist, **both** must pass.
- Top-1 means the provider's first candidate. Top-k means any returned candidate among requested k. Top-k correctness is an assisted-review success, not an automatic top-1 success.
- An explicit `noMatch: true` label is satisfied only by an error-free response with zero candidates. Service errors never satisfy a no-match oracle.
- Provider confidence, match codes, entity type and calculation method are diagnostic evidence, never independent truth or calibrated correctness probability.
- Cases lacking independent truth stay unscored, even if an analyst accepts a candidate.

Truth may be weak: for example, a locality-only label establishes only locality agreement. Declare required precision and label completeness before relying on aggregate correctness. The application cannot establish that a human's `expected.source` is genuinely independent.

## Denominators and uncertainty

Every input case is evaluated once per chosen strategy. Do not multiply the apparent sample size by treating the two strategies as independent addresses.

- Coverage: candidate-bearing successful trials / all trials.
- Accuracy: correct labelled trials / all labelled trials, **including request errors as failures**.
- Negative controls are included in labelled accuracy. Report their category separately so abstention success does not conceal poor positive-address resolution.
- No labels: accuracy and confidence intervals are `null`, not zero or 100%.
- Error rate includes malformed provider responses, missing fixtures, exhausted retries, authorization failures and other explicit request failures.
- Wilson 95% intervals are descriptive for each strategy. Repeated addresses, a handpicked set or correlated error modes violate simple independent random-sample assumptions. Do not claim population confidence from them.
- Latency uses nearest-rank p50/p95, includes local work/token acquisition/retries and includes error observations. It does not include time waiting for a worker before a trial starts. Fixture timings measure local overhead only.
- `httpAttempts` counts actual attempted Maps HTTP calls, including retries, not authoritative billable transactions. Confirm invoicing semantics and current pricing externally. There is no hidden pricing estimate.

## Exploratory adjudication

Inspect ranked candidates, diagnostics, truth field comparisons and distance residuals in the case dialog. Record accepted, rejected or unresolved for the **top candidate**, reviewer identity, rationale and timestamp.

Acceptance requires a successful request with a candidate. Decisions do not rewrite expected answers or automated accuracy. Repeated edits append a review history to detailed JSON. This is a self-reported analyst log, not an authenticated or tamper-evident audit ledger. A review of an error/no-match result can be rejected or unresolved but cannot become a candidate acceptance.

Browser results and reviews are in memory. Export detailed JSON to an approved location **before reload**. There is no browser localStorage, IndexedDB, telemetry or automatic server retention. An exported JSON report is evidence, not a supported import/resume format.

## Reproducibility and publication

Each report records normalized dataset SHA-256, application version, UTC timestamp, run ID, API version, geography, top-k, strategies and concurrency. The detailed report contains the normalized input and candidate evidence needed to reproduce comparisons.

Expected labels are part of the fingerprint. Changing a label creates a different dataset digest; do not compare digest equality after changing the oracle. Backend/API responses are normalized rather than retained as arbitrary raw payloads.

Default exports contain aggregate metrics and the digest only; case IDs, category labels, queries, expected answers and review notes are omitted. A digest is pseudonymous metadata and may still be sensitive for small/guessable datasets. Review aggregate disclosures before publication.

The HTML report is self-contained and printable. The findings microsite is the live exploratory presentation surface. Neither contains a prewritten positive recommendation. The next decision is to collect approved live evidence, inspect failures, repeat on holdout data, and compare with Zava's agreed operational criteria.
