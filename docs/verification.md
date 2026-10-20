# Verification status

## Executed successfully

All checks below were executed in the authoring environment on Windows with Node.js **22.21.0**. They use invented fixture data or injected provider responses; they do not submit addresses to Azure Maps.

| Check | Result |
| --- | --- |
| `npm run check` | JSDoc/TypeScript strict checking and ESLint passed |
| `npm run test:coverage` | **46** unit/HTTP tests passed |
| Core coverage | **98.07% lines**, **85.60% branches**, **97.85% functions** |
| Coverage thresholds | 85% lines, 75% branches, 85% functions; enforced by the test command |
| `npm run test:bdd` | **5 scenarios / 21 steps** passed |
| `npm run test:acceptance` | **20** tests passed across desktop and mobile Chromium |
| `npm run verify` | All four application quality gates passed together after the final source changes |
| `az bicep build` | Template compiled successfully; no template/linter diagnostics |
| PowerShell parser | All three deployment/packaging/validation scripts parsed successfully |
| Packaging check | All 20 expected application-package entries verified; required assets present, private-data/result/env/source-control paths excluded |
| Fixture CLI | All four output files persisted; exact 16-trial / 12-labelled / zero-HTTP-attempt contract verified |
| Manual browser inspection | Overview, exact fixture metrics, ranked candidate comparison, and case inspection exercised |
| Standalone HTML | Browser acceptance test verified the downloaded HTML, static-script CSP hash, and explicit dark-theme rendering |

The Bicep CLI printed an available-tool-upgrade notice. This is not a template validation warning and the local tool was not upgraded.

Coverage scope is the shared dataset/evaluation/report/error/theme modules plus the provider and experiment modules. It is **not** full application, server, CLI or UI coverage. HTTP/server and browser acceptance checks supplement it; they do not establish exhaustive coverage.

The browser tests verify initial absence of efficacy claims, explicit offline/live state, exact metric denominators, category-by-strategy breakdown, lower-ranked correctness, manual review without accuracy inflation, privacy defaults, opt-in detailed export, invalid-input rejection before a run request, no external fixture requests, mobile overflow, CSV upload wiring, visible review errors, and standalone HTML behavior.

Provider tests include invalid schema rejection, bounded retry/backoff, authentication failure without a Maps HTTP call, actual request deadline aborts, 429/503 handling, excessive retry-delay rejection, cancellation during backoff, diagnostics, and no leakage of expected coordinates into request context.

## Deliberately not verified or executed

- No Zava address dataset has been supplied or evaluated.
- No live Maps calls, customer address submissions, cloud provisioning, role assignments, or billable benchmark requests were made.
- Azure CLI was not signed in; Azure **what-if**, policy/quota/region checks and remote deployment validation were therefore not executed.
- Hosted Entra login, group authorization, Key Vault reference resolution, managed-identity RBAC and approved geographic processing require a real deployment and real tenant identities.
- Linux CI is configured but has not been run in this local Windows environment.
- No business success threshold or production suitability conclusion has been agreed or asserted.
- The checks are not a penetration test, compliance certification, service availability guarantee or mail-deliverability validation.

## Dependency restore note

Initial dependency restoration encountered TLS/timeout errors and differing package versions between registries. Stable pinned versions were resolved and a lockfile generated through the environment's public Microsoft package mirror; the locked install then completed successfully. TLS/certificate verification was not disabled. The lockfile preserves integrity values and public mirror artifact URLs; the project default registry remains npmjs.

Use `npm ci` to reproduce the locked dependency tree. If your environment cannot reach the lockfile's public mirror URLs, regenerate the lockfile through your organization's approved registry and rerun the quality gates. Do not work around failures by disabling TLS verification.

## Evidence interpretation

The included sample has eight invented cases, two strategies and deliberately mixed outcomes. Its **simulated** coverage/correctness values prove that the harness's denominators, comparisons and exports work; they are not an estimate of Azure Maps efficacy. Collect independently labelled live evidence and repeat on a representative holdout set before making a recommendation.
