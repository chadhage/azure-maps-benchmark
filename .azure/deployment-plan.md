# Azure Maps Pilot Deployment Plan

## Public demo access (approved request, 2026-10-20)

The user repeated the request to make the demo accessible to everyone with its
URL. Remove sign-in for the harness and live single/batch submission routes.
Use the existing app/subscription/Central US and GitHub Actions deployment only.

- Add explicit public-demo configuration; allow hosted binding without login
  only in this mode. Public live mode requires a persistent positive attempt cap.
- Keep existing 30-attempt ledger without reset, consent, input limits, one
  active run, host/origin checks and managed-identity Maps access.
- Wire Bicep and GitHub deployment settings/probes to the public mode. Apply
  settings through Actions after code deployment; no local Azure changes.
- Keep vault private and retain identity resources for potential access rollback.
- Verify anonymous page/config and a fixture POST without paid Maps calls.
  Validate malicious-origin denial and public-mode startup constraints offline.
- Public visitors can use all remaining live allowance. URL access is public,
  not a secret link; no per-user quota or internet-scale availability is promised.
- Update access documentation. No access settings have changed yet.

## GitHub Actions deployment migration (approved implementation)

- Requested: application deployments only through GitHub Actions after PR/push.
- Preserve existing app, authentication, private connectivity and attempt ledger.
- Keep quality gates before publishing an allowlisted application ZIP.
- Prefer GitHub OIDC and app-scoped deployment permissions, not stored secrets.
- User approved: main pushes deploy automatically after gates; same-repository
  PR merge refs deploy to the shared site after owner approval; fork PRs test only.
- No local application deployment or publication of uncommitted work. Local
  deploy script Apply and azd provisioning/deployment hooks are blocked.
- Actual GitHub environments created: main-only zava-demo; PR-ref-only
  zava-demo-pr with chadhage required reviewer (self-approval permitted).
- Actual dedicated passwordless registration created: zava-maps-github-deploy,
  client 24f32c6a-1cc3-4e3e-9c3d-34e3513b6052, service principal
  b5120f13-0045-4574-be71-32bb0b044bd3. Website Contributor only on existing app.
- Existing Owner/Contributor access is not removed; repository guards are not
  a hard Azure-wide deployment restriction.
- Exact OIDC subjects for both environments and all three nonsecret repository
  variables are configured and read back. Registration has zero passwords.
- Full npm verify passed: type/lint, 51 unit tests with coverage gates, five BDD
  scenarios and 28 desktop/mobile browser tests. Actionlint 1.7.12 and YAML parse
  pass. Package inventory remains exactly 21 allowlisted files. Local Apply
  fails before parameter-file access or Azure operations.
- First successful GitHub run remains required; publication is recorded below.

Publication and first-run diagnosis:
- User approved committing/pushing all nonignored project changes. Commit
  51b69cb reached main. Run 39368410956 passed both verification platforms and
  packaging but failed Azure login before deployment with AADSTS700213.
- GitHub reports use_immutable_subject=true and exact prefix
  repo:chadhage@556099/azure-maps-benchmark@1422607619. Both federated records
  were corrected/read back using that API-provided prefix and exact environment.
  No wildcard trust or change to GitHub subject security was introduced.
- Artifact naming now uses run ID, not attempt ID, so a failed deploy-only rerun
  can download the already verified package. A full packaging rerun overwrites
  only the same run's artifact for the same immutable commit.
- Initial release acceptance still pending successful Actions deployment.
- Run 39369158506 then passed OIDC login and ZIP deployment; its final probe
  failed because Invoke-WebRequest -MaximumRedirection 0 throws on an expected
  Easy Auth 302. Hosted health remained 200, new header present, anonymous curl
  API request denied with 401. Probe now uses a nonredirecting HTTP client and
  accepts only 401/403 or HTTPS redirects to the same-site login or exact
  approved Entra tenant/client/callback. The browser-style probe demonstrated
  a direct tenant authorization redirect; the check now covers that actual
  platform behavior without following the redirect.

> **Status:** Validated

## Bounded live activation (2026-10-20 UTC)

User explicitly approved enabling the existing hosted demo with its unchanged
shared 30-attempt cap. Diagnosed disabled button as ENABLE_LIVE=false, not an
acceptance-status interlock. Verified app identity has Maps Data Reader and
Easy Auth still requires the approved group. Operational change is limited to
ENABLE_LIVE=true; no new resources, RBAC grants or allowance reset. Private CLI
parameters now persist enableLive=true and the explicit cap for future deploys.
Activation verification and real response acceptance are tracked separately.
Activation persisted successfully: ENABLE_LIVE=true, cap 30, platform auth true,
health 200. User confirmed Resolve enabled; submitted POST returned empty 403.

Cookie-authenticated POST repair:
- Browser client had no-referrer policy; official Easy Auth CSRF guidance
  identifies missing Referer/Origin as a rejection condition.
- Change only Referrer-Policy to same-origin (never external); keep exact Origin,
  Sec-Fetch-Site and Entra group checks. No CORS wildcards or CSRF bypass.
- API client preserves status for empty/non-JSON error responses and reports
  malformed successful responses explicitly, without exposing response HTML.
- Replace misleading initial demo status text with page-session response status.
- Type/lint, 51 unit/HTTP tests and eight targeted desktop/mobile browser tests
  passed, including same-origin Referer and empty platform errors.
- Application-only package update deployed successfully at 2026-10-20 02:57 UTC;
  CLI confirmed build and site startup success. No infrastructure/access changes.
- Actual hosted health 200 and Referrer-Policy: same-origin verified after
  completion. Anonymous /api/config is denied with 401, live remains true,
  cap remains 30, platform auth true. Login secret reference reports Resolved.
- Deployment probes alone did not establish resolution of the empty 403;
  authenticated acceptance was required and is recorded below.

Subsequent authenticated acceptance: the user refreshed the hosted harness and
confirmed "Location candidates and address fields returned." This verifies demo
1a and the repaired POST path for that user's session. The user then submitted a
live batch in the same harness and confirmed "Every uploaded row returned an
outcome." Demo 1b is user-verified at the per-row outcome level. Neither result
establishes address correctness or representative efficacy.
Actual remaining HTTP allowance has not been inspected; the durable cap remains
30 and must not be reset.

## Callback 401 repair amendment (2026-10-19)

The user requests repair of the hosted Entra callback 401. Read-only inspection
confirmed the web registration has no password credentials and the referenced
vault has public access disabled with no private endpoint. Consent succeeds
before the confidential-client token exchange; real callback acceptance is the
repair gate, not a health probe.

Proposed repair: retain tenant/group restrictions and disabled vault public
access; add private vault connectivity and app VNet integration, then securely
create/store a policy-compliant login credential and verify reference resolution
and interactive sign-in. Existing subscription, region, request allowance and
invitation timing stay unchanged. The user previously declined networking;
explicit confirmation of this amendment was received on 2026-10-19 for the
existing subscription and Central US. No policy exemption or public-access
bypass. Implementation uses an isolated 10.247.0.0/24 VNet (no peerings), a
delegated /26 app subnet and /27 private-endpoint subnet, a private DNS zone/link,
and the vault endpoint. No existing network integration was present.
Central US quota check: virtual networks 5/1000 and private endpoints 5/65536;
one additional of each fits. Both Bicep entry points compile. Private DNS is
linked only to this VNet; vault public access and default network action remain
Disabled/Deny. Existing app identity/vault-reader role is unchanged.

Repair validation proof (2026-10-19):
- Shared direct CLI helper: OVERALL PASS (CLI/auth/build/ARM validate/what-if).
- Exact JSON preview: five network resource creates, zero resource deletes.
  Text helper's Delete count includes property deltas, not resource deletion.
- Existing plan discovered as F1; user explicitly approved restoring B1 for
  supported VNet integration and its ongoing charges. No SKU change elsewhere.
- Modifications remain scoped to the dedicated group. Vault network ACL changes
  tighten to Deny; managed-identity RBAC is unchanged (preview principal
  expressions are unresolved). Existing audit/modify policies retained.
- Static RBAC review: app retains vault Secrets User and Maps Data Reader;
  deployer retains dedicated vault Secrets Officer. Networking grants no users.
- No application code changes; both infrastructure entry points compile.
- Callback/user authorization is a post-deployment gate, not claimed passed.

Repair deployment and acceptance (2026-10-19):
- Deployment `maps-demo-auth-repair` succeeded. B1 capacity one, delegated
  integration subnet and outbound VNet routing verified.
- Vault public access remains Disabled, default ACL Deny. Private endpoint
  connection Approved; private DNS maps the vault to 10.247.0.68.
- Created one seven-day credential and stored it directly in the dedicated
  Key Vault using an authenticated management resource request, in memory only.
  No secret values were written to source, files, parameters or output.
- Credential expires 2026-10-26T06:15:23Z; rotate before expiry. Existing app
  identity Secrets User role retained. Forced reference refresh reports
  Resolved ("Reference has been successfully resolved.").
- Restarted app: health 200; anonymous site/API still 302 to the correct tenant.
  Easy Auth and the exact approved access group remain enforced.
- User performed fresh hosted sign-in and confirmed "Harness loads successfully."
  The reported post-consent callback 401 is resolved.
- No live Maps calls made, live remains disabled, and no invitation emails sent.
  Other invitee membership and signed-in nonmember denial remain separate gates.

## Demo 1a / 1b scope update

The user requests a hosted, invite-only demo for explicitly selected email
addresses, with a single-location flow (1a) and address-only CSV upload flow (1b).
This supersedes local-only demo preparation. Infrastructure provisioning has
succeeded; hosted authentication and live acceptance remain blocked as recorded
below. Prior validation evidence is retained, not proof of live readiness.

### Initial deployment outcome (before the repair above)

- Dedicated infrastructure deployment `maps-demo-initial`: Succeeded.
- Endpoint: https://app-maps-pilot-d2c4f436.azurewebsites.net
- Application ZIP built successfully. Initial startup failed because ARM
  serialized `ENABLE_LIVE` as `False`; template fixed to explicit lowercase,
  corrected remote setting to `false`, restarted and verified `/healthz` 200.
  Corrected Bicep also passed actual subscription-scope ARM validation.
- Anonymous `/`, `/api/config` and `/api/run` redirect to the correct tenant's
  Entra login (302). Positive member and signed-in nonmember tests remain
  pending. Health explicitly reports Maps connectivity as not checked.
- Actual Maps Data Reader and both dedicated vault-scoped roles verified.
  Actual $100 budget and enabled 80%/100% email alerts verified.
- Inherited `KeyVault_PublicNetwork_Modify` changed the requested public vault
  access to Disabled. The original preflight passed ARM validation but did not
  establish post-policy data-plane reachability. No private endpoint exists;
  login-secret storage failed with ForbiddenByConnection.
- The proposed private endpoint/VNet/DNS amendment was explicitly declined.
  No networking added, policy exception requested, or firewall weakened.
- A 90-day secret was rejected by credential policy. A seven-day credential
  was created but could not be stored; the user explicitly approved removing
  that exact unused key. Deletion verified; the app now has no credentials.
- Live remains disabled; zero Maps attempts and zero invitation emails.
  Approved rehearsal address retained only in ignored private configuration.
  Invitee resolution/group additions/email delivery are not marked complete.
- Latest functional evidence: 51 unit/HTTP tests, five BDD scenarios and 24
  browser tests (demo routes mocked), plus type/lint and exact package checks.
  Neither 1a nor 1b is declared live-demo complete.
- Existing B1/monitoring resources remain provisioned and may incur charges
  while blocked. No resource deletion was authorized or performed.

Planned acceptance gates:
- A dedicated single-location input uses the existing live geocoding backend.
- A file-upload batch uses the same backend and reports each row's candidates,
  no-match result or explicit error, with exportable address components.
- Invitees authenticate through Entra; only explicitly approved identities in
  the access group can use the site/API. Email is used to resolve/invite an
  identity, never trusted as an unauthenticated browser assertion.
- Anonymous and authenticated nonmember access is denied; invited access is
  positively verified before declaring the hosted demo ready.
- Real Azure Maps responses are observed for both flows before marking 1a/1b
  complete; fixture results do not satisfy live-demo acceptance.
- Additional demo request allowance and approved test data must be confirmed
  separately from the previously frozen exploration/holdout pilot.

Approved: eight explicit email identities (retained in private configuration),
including the existing owner. Invitation emails are authorized only after the
site is ready. Demo users supply a single address or a headerless one-column
CSV; no extra fields are required. Addresses with commas must be CSV-quoted.
Unknown, blank, malformed or oversized inputs fail before provider calls.
The new live demo allowance is 30 total HTTP attempts, separate from the frozen
evaluation pilot; preserve the latter and do not use its holdout for demos.
Implement a persisted attempt ledger and fail closed at exhaustion. Verify both
flows with mocked/offline UI tests first; a real live rehearsal requires user
input or separate approval of public test addresses. No fabricated resolution
or fixture-only completion claim is permitted.

Updated: 2026-10-18

## 1. Project overview

Modify the existing Node.js evaluation workbench to support Azure Developer CLI
(azd) with Bicep, preserving its offline behavior, private-data packaging allowlist,
managed-identity Maps access, and group-restricted hosted access.

The user authorized conversion to azd and use of the existing Azure CLI login.
The user approved this completed deployment plan before implementation.
The separately approved Entra prerequisites and subsequent application
infrastructure have been created. See the current outcome for blocking issues.

## 2. Requirements and confirmed context

| Attribute | Value |
|-----------|-------|
| Classification | Small, single-analyst POC; not a production banking platform |
| Subscription | MCAPS-Hybrid-REQ-59765-2023-chhage |
| Subscription ID | 474c40eb-d385-40d8-baa2-06883dbdca2d |
| Tenant ID | 16b3c013-d300-468d-ac64-7eda0820b6d3 |
| Hosting location | Central US, previously approved |
| Maps endpoint geography | Global, previously approved; not a data-residency guarantee |
| Authentication | Existing Azure CLI sign-in; no further device-code sign-in |
| Cost control | $100 monthly resource-group budget, 80%/100% email alerts; not a hard spending stop |
| Budget recipient | Previously supplied recipient, retained in private deployment configuration |
| Pilot limit | At most 60 HTTP attempts across the two fixed pilot runs; not a dollar-spend guarantee |
| Evaluation | 100% top-1 target separately per strategy; five labelled holdout cases |
| Evidence limitation | Small exploratory pilot; labels cover only one scenario stratum |
| Data handling | Approved inputs/results stay private and out of application packages and public assets |
| Access group | New security group; approved owner is also an initial member; B2B guests permitted subject to tenant policy |

CLI verification on 2026-10-18 confirmed the approved tenant/subscription,
subscription-level Owner assignment, and Microsoft Graph read access.
The approved group owner's email resolved to the currently signed-in object.
Graph confirms its userType is Member despite the external-style username.
Subscription Owner does not establish permission to create Entra objects.
The user separately approved creating the new identity prerequisites before ARM
preview and rerunning offline functional tests.

## 3. Components detected

| Component | Technology | Existing location |
|-----------|------------|-------------------|
| Workbench and API | Node.js 22, native HTTP server | `src/server.js`, `public/` |
| Evaluator | Shared evaluation modules, CLI and provider | `src/`, `public/modules/` |
| Hosting and access | Resource-group-scoped Bicep | `infra/main.bicep` |
| Packaging | Explicit source/data allowlist | `scripts/package.ps1` |
| Deployment | Azure CLI, PowerShell, what-if and explicit apply | `scripts/deploy.ps1` |
| Quality gates | TypeScript checking, ESLint, unit/BDD/Playwright | `package.json`, `test/` |

## 4. Recipe selection

**Selected:** Azure CLI with Bicep (`recipe.type: azcli`), approved by the user
after azd's CLI-authentication integration failed during preview.

The azd configuration and packaging path remain available, but azd provisioning
is not validated. ARM validation, what-if and deployment will use Azure CLI
with the same subscription-scope entry point and architecture.

Use azd's Azure CLI authentication integration, not a new browser login.
Install azd only because it was confirmed missing. Do not initialize from a
template over the existing repository.

Retain the existing resource-group template as a reusable child module and add
a subscription-scope entry point for the new dedicated resource group. Add
azd environment/service tags, parameter substitution and endpoint outputs.
Keep the existing custom deployment path functional and documented.

## 5. Architecture

| Component | Azure service | Configuration |
|-----------|---------------|---------------|
| Isolation | New resource group | Central US, POC/restricted-data tags |
| Hosting | Linux App Service plan | One B1 instance, Node 22 LTS |
| Workbench | App Service | HTTPS, TLS 1.2+, Easy Auth, basic publishing credentials disabled |
| Geocoding | Azure Maps | Gen2/G2, local/key authentication disabled |
| App-to-Maps identity | System-assigned managed identity | Maps Data Reader at the new account only |
| Login credential | Dedicated Key Vault | Standard, RBAC, soft delete and purge protection |
| Hosted user login | Single-tenant Entra web application | Exact callback URI, approved access group |
| Monitoring | Log Analytics and workspace-based Application Insights | Minimal operational diagnostics; no address payload or query logging |
| Budget | Resource-group consumption budget | $100 monthly, 80% and 100% email alerts |

Do not enable automatic request/dependency telemetry that could capture address
queries. Operational diagnostics must be reviewed for sensitive content before
enabling collection. Monitoring is not a full application audit ledger.

Create the Entra registration/group and securely transfer its client secret to
the dedicated vault without printing, committing or putting the secret in ARM
parameters/outputs. Verify directory write permissions first; fail explicitly
and request administrator assistance if denied.

Live mode stays disabled during hosting/access validation. No additional
billable Maps smoke tests outside the approved 60-attempt plan are authorized.

### Policy constraints

The earlier policy query found 27 assignments, including inherited governance
deny/audit/modify initiatives, MFA enforcement for writes/deletes, and disabled
FTP/SCM local authentication. Preserve both publishing-credential restrictions.
Assignment names alone do not establish compliance: resolve relevant definitions
and parameters during remote validation, then review exact what-if results.

## 6. Provisioning limit checklist

Read-only inventory and quota checks were performed against the approved
subscription on 2026-10-18. Microsoft.Quota was initially unregistered; it has now
been registered and the missing local quota extension installed.

| Resource/constraint | New | Current | Total after | Limit/source and interpretation |
|---------------------|-----|---------|-------------|---------------------------------|
| Resource groups, subscription | 1 | 21 | 22 | 980; Azure CLI inventory + official subscription limits |
| B1 instances, Central US | 1 | 3 | 4 | 13; `az quota show` and `az quota usage show`, resource name `B1` |
| App Service plans, Central US | 1 | 5 | 6 | B1 instance quota checked above; no separate plan-count quota asserted |
| Web apps, Central US | 1 | 5 | 6 | Dedicated new B1 plan; validate its app limits in ARM preview |
| Maps accounts, global | 1 | 0 | 1 | Quota API returns BadRequest; no account-count limit established by retrieved official limits; ARM validation required |
| Key Vaults, Central US | 1 | 1 | 2 | Quota API returns BadRequest; no vault-count quota established; ARM validation required |
| Log Analytics workspaces, Central US | 1 | 1 | 2 | Quota API returns BadRequest; official Monitor limits specify no workspace-count limit for nonlegacy tiers, subject to ARM limits |
| Application Insights components, Central US | 1 | 0 | 1 | Quota API returns BadRequest; no component-count quota established; ARM validation required |
| Resource-group budgets, new group | 1 | 0 | 1 | Subscription budget API readable; validate target-scope budget support during ARM preview |
| Scoped RBAC assignments | 3 | 0 in new scopes | 3 in new scopes | Two application grants and deployer Secrets Officer on the new vault only |
| Entra application and security group | 1 each | Not inventoried tenant-wide | Adds one each | Graph reads work; directory writes and tenant object limits not yet verified |

Central US is returned by `az appservice list-locations --sku B1
--linux-workers-enabled`, and Linux runtime discovery includes `NODE:22-lts`.
These checks establish advertised availability and B1 quota headroom, not a
reservation or a guarantee of regional physical capacity.

**Status:** B1 quota passes. Unsupported or unexposed quotas are explicitly
unverified, not unlimited. Remote validation and directory permission checks
remain blocking gates before any application provisioning. No quota increase
was requested.

Official references:
- [Subscription/service limits](https://learn.microsoft.com/azure/azure-resource-manager/management/azure-subscription-service-limits)
- [Azure Monitor limits](https://learn.microsoft.com/azure/azure-monitor/service-limits)

## 7. Execution checklist

### Planning
- [x] Analyze existing application and deployment path.
- [x] Retain previously approved subscription, location and pilot boundaries.
- [x] Verify existing CLI login, subscription Owner and owner-account resolution.
- [x] Inventory resources; verify B1 quota and advertised Linux/runtime support.
- [x] Record unsupported quota APIs and remaining validation requirements.
- [x] Select azd/Bicep conversion without overwriting user work.
- [x] User approves this completed plan.

### Preparation, after approval
- [x] Install missing azd and configure it to use existing Azure CLI authentication.
- [x] Verify directory creation permissions without exposing credentials.
- [x] Research current Bicep schemas/modules and finalize minimal infrastructure changes.
- [x] Add azd configuration, isolated packaging hooks, parameters and infrastructure entry point.
- [x] Preserve managed identity, group authorization, vault references and disabled local publishing credentials.
- [x] Update deployment documentation and test the exact packaged file inventory.
- [x] Run relevant offline tests and Bicep compilation.
- [x] Set status to Ready for Validation; hand off to azure-validate next.

### Validation and deployment
- [x] Complete azure-validate workflow, actual policy/permission checks and ARM preview.
- Initial azd attempt (superseded; failures retained, not claimed as passes):
  - [ ] 1. AZD Installation
  - [ ] 2. Schema Validation
  - [ ] 3. Environment Setup
  - [ ] 4. Authentication Check
  - [ ] 5. Subscription/Location Check
  - [x] 6. Aspire Pre-Provisioning Checks (not applicable)
  - [ ] 7. Provision Preview (blocked for azd; not claimed as passed)
  - [ ] 8. Build Verification
  - [x] 9. Docker Build Context Validation (not applicable)
  - [ ] 10. Package Validation
  - [ ] 11. Azure Policy Validation
  - [x] 12. Aspire Post-Provisioning Checks (not applicable)
- [x] All validation checks pass (active Azure CLI recipe):
  - [x] 1. Core Validation (CLI, auth, build, validate, what-if), using the shared validation helper with subscription scope and explicit template/parameters.
  - [x] 2. Docker Build (not applicable; native Node App Service deployment).
  - [x] 3. Azure Policy Validation, including inherited assignments.
- [ ] Review changes and costs; no exact B1/G2 agreement-specific estimate is established yet.
- [ ] Invoke azure-deploy only after successful validation.
- [ ] Provision the approved identity/vault prerequisites in the validated order.
- [ ] Verify health, denied anonymous/nonmember access, permitted member access and vault resolution.
- [ ] Confirm actual budget/alert configuration.
- [ ] Enable live mode only for the approved bounded pilot.

### Evidence
- [ ] Run exploration once, inspect results, freeze configuration.
- [ ] Run the frozen holdout once, keeping combined attempts at or below 60.
- [ ] Preserve detailed outputs privately; document decision and pilot limitations without representative efficacy claims.

## Validation proof

Public-mode preparation, 2026-10-20:
- `npm run verify` passed all quality gates, including public hosted startup,
  anonymous page/config/fixture submission, consent/origin enforcement and
  private-file denial. Existing restricted-mode behavior remains tested.
- Both Bicep entry points compile. Resource-group default remains restricted;
  dedicated wrapper explicitly defaults public and passes that flag through.
- Packaging passes its exact 21-file allowlist; workflow YAML parses.
- Complete results: 53 unit/HTTP tests, five BDD scenarios and 28 browser tests,
  coverage gates, type/lint all pass. Actionlint 1.7.12 and embedded PowerShell
  parsing pass.
- CLI core validation passes authentication, compilation, ARM validation and
  what-if. Preview reports 12 creates/27 modifies/12 deletes; the infrastructure
  preview is NOT being executed. Only the existing app's ZIP and explicit
  public access flags are deployed through Actions.
- Maps/vault roles remain unchanged. The existing app-scoped Website Contributor
  deployer role was read back and covers app config access; no role expansion.
- No new resource type/location or policy exception is included; retained
  inherited-policy review applies. Actual ARM validation found no blocking error.
- No local access-setting updates or application deployments were executed.
  The Actions job will set only PUBLIC_DEMO/REQUIRE_PLATFORM_AUTH and Easy Auth
  public enforcement flags after code deployment, verifying cap 30 first.
  It never resets the ledger or changes live enablement.

GitHub Actions migration validation, 2026-10-20 UTC:
- `npm run verify` passed: types/lint, 51 unit/HTTP tests and required coverage,
  five BDD scenarios (21 steps), 28 browser tests.
- Actionlint 1.7.12, YAML parsing and all workflow PowerShell blocks pass.
- Six event-policy cases verified: main push and same-repository PR eligible;
  branch push, tag, fork PR and manual dispatch ineligible for deployment.
  Job dependencies enforce both verification platforms before packaging;
  only the deployment job has OIDC permission, and it does not check out code.
- Exact package inventory passes; local Apply rejects before any Azure work.
- CLI core helper passed auth, compile, ARM validation and what-if. Preview
  counts remain 12 creates/22 modifies/12 deletes; none of those infrastructure
  changes will be applied. Pipeline releases application ZIPs only.
- Deployment identity role read back: Website Contributor only at existing
  App Service scope. Existing Maps/vault identities unchanged. No policy
  exemption, public access change or new hosting resources.
- GitHub environments and branch filters read back; PR reviewer is chadhage.
  Exact issuer/audience/environment federation read back; password count zero.
  Three nonsecret Azure repository variables configured.
- Azure OIDC login and end-to-end release cannot be claimed until the workflow
  and application changes are committed/pushed and a GitHub run succeeds.

Direct CLI core validation passes. Infrastructure deployment and owner sign-in
are verified above; live Maps response acceptance remains pending. The obsolete
azd failures below are retained as history, not blocking the CLI recipe.

Application-only POST repair validation, 2026-10-20 02:51 UTC:
- `npm run check`: type/lint pass; `npm run test:unit`: 51/51 pass.
- Targeted acceptance selector for 1a/1b, platform empty/non-JSON errors and
  same-origin POST: 8/8 pass across desktop/mobile (API mocked, not live evidence).
- `scripts/package.ps1` and `scripts/test-package.ps1`: exact 21-file allowlist;
  archive `azure-maps-poc-684dfa1e-cf0c-4c5a-a6ca-fa1a3233510f.zip`.
- Core CLI helper with subscription scope, current Bicep/private parameters:
  CLI/auth/compile/ARM validation/what-if PASS.
- Preview text reports 12 creates, 22 modifies, 12 deletes. Infrastructure is
  NOT approved for execution from this preview and will NOT be deployed.
  This release is strictly a code ZIP update to the existing app.
- Subscription policy assignments queried; retained inherited-policy review
  above applies to unchanged infrastructure; no policy exception or setting
  change is included in this ZIP.
- Static app role definitions remain scoped Maps Data Reader and vault Secrets
  User. Live roles verified at these scopes. ARM authsettingsV2 confirms required
  authentication and the exact approved group.
- Actual remote live=true, limit=30, platform auth=true. No attempt ledger reset,
  allowance expansion, infrastructure or access change is part of this release.

| Check | Command run | Result | Timestamp |
|-------|-------------|--------|-----------|
| CLI management authentication | `az account get-access-token` for approved tenant, management and legacy ARM audiences; output restricted to expiry/tenant | Pass | 2026-10-18 |
| azd credential check | `azd auth login --check-status` | Pass with `auth.useAzCliAuth=true` | 2026-10-18 |
| ARM preview | `azd provision --preview --no-prompt` | Fail before ARM changes: subscription discovery returns AzureCLICredential exit status 1, including approved tenant | 2026-10-18 |
| Explicit principal/subscription retry | Store verified `AZURE_PRINCIPAL_ID`; `azd provision --preview --no-prompt --subscription <approved-id>` | Same discovery failure; no deployment | 2026-10-18 |
| MCP schema validator | Azure MCP azd tool initialization | Tool process has stale PATH and cannot locate newly installed azd | 2026-10-18 |
| Direct CLI core helper | `validate-deployment.ps1 -Scope sub -Location centralus` with approved subscription/template/private parameters | OVERALL PASS: CLI, auth, Bicep, ARM validate and what-if | 2026-10-18 |
| Exact preview | `az deployment sub what-if --no-pretty-print` | Create-only: dedicated group plus 14 resource changes; 0 modifications/deletions. Raw result private under artifacts. Helper text count was 16 because it also counted formatting lines. | 2026-10-18 |
| AVM quota type | First direct ARM validate | Caught dailyQuotaGb float/string mismatch. Corrected to string `0.1`; subsequent actual ARM validate passed. | 2026-10-18 |
| Effective policies | ARM policyAssignments atScope() via authenticated CLI | 20 effective assignments including inherited management groups. Classic types not used; MCAPS deny set targets VM/AKS/SQL/HSM etc. not these resources. FTP/SCM local authentication disabled; no public-IP allocation or Foundry resource. MFA-write accepted by actual validation. Audit/modify/baseline assignments retained, not disabled. No blocking policy violation in ARM validate/what-if; this is not a blanket production compliance certification. | 2026-10-18 |
| Build/package | `npm run check`; Bicep builds; `test-package.ps1` | Pass; 21 exact allowlisted application files; no roster/private inputs/secrets | 2026-10-18 |

## Role Assignment Verification

- Status: Verified statically; live assignment propagation remains a deployment gate.
- App system identity: Azure Maps Data Reader on the new Maps account only,
  matching geocode data-plane calls; Key Vault Secrets User on the dedicated
  authentication vault only, matching the Easy Auth credential reference.
- Deployer user: Key Vault Secrets Officer on the dedicated vault, to store the
  login credential. No unrelated vault/subscription data-plane grant.
- Local Maps data-plane testing is not authorized by subscription Owner alone;
  use the hosted identity for live rehearsal, or explicitly provision a reviewed
  local data-plane grant. No such additional grant was made here.

CLI token requests for the same tenant/audiences succeed directly. This is an
azd/CLI integration blocker, not evidence that the user must repeat browser
authentication. No Conditional Access workaround, credential export or
validation bypass has been attempted. Debug/preview logs remain in ignored
`artifacts/`. The user approved switching execution to the retained Azure CLI path with the
same templates and validation gates. Restart the validation workflow with the
Azure CLI recipe; do not mark the azd checks as passed.

## Preparation evidence

Demo amendment preparation:
- Single-location form and separate headerless one-field CSV flow implemented.
- Candidate dialog and opt-in CSV export include structured address fields.
- Shared 30-attempt ledger reserves each HTTP attempt, persists across restart
  and fails closed on exhaustion/corruption. Single-instance/process only.
- Type checking/lint passed; 50 unit/HTTP tests passed, five BDD scenarios passed,
  and 24 desktop/mobile browser tests passed (new live routes mocked, not live
  acceptance). Both Bicep entry points compile.
- Exact package inventory passed: 21 allowlisted files, no private roster/data.
- Eight approved emails retained privately; no invitations sent.
- Real Maps and interactive Entra access remain unverified; no 1a/1b completion
  claim yet. Ready for the direct CLI validation gate, not yet for deployment.

- Azure Developer CLI 1.36.0 installed; `auth.useAzCliAuth` configured to true.
- Environment `maps-pilot` explicitly targets the approved tenant/subscription
  and Central US; local environment settings are ignored.
- Created the separately approved security group, verified its owner and initial
  member, and created a single-tenant web registration/service principal.
  The app has the exact callback for `app-maps-pilot-d2c4f436`, SecurityGroup
  claims and no password credentials yet. Object IDs are in the private azd
  environment. The installed CLI required an app-update operation for claims;
  the rejected create flag did not create a duplicate registration.
- Both Bicep entry points compile. New supporting resources use pinned AVM
  resource modules: no combined pattern for this existing Maps/Easy Auth
  workbench was selected; its established resource definitions remain intact.
  AVM telemetry is disabled.
  - [Key Vault 0.14.0](https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/key-vault/vault)
  - [Log Analytics 0.16.0](https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/operational-insights/workspace)
  - [Application Insights 0.8.0](https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/insights/component)
- `azd package web --output-path .\artifacts\azd-web.zip --no-prompt`
  succeeded. `scripts/test-package.ps1` verified exactly 20 allowlisted files.
- `npm run check` passed. Functional verification: 46 Node unit/HTTP tests,
  5 BDD scenarios (21 steps), and 20 Playwright acceptance tests passed.
  The editor test tool could not discover the Node tests; the repository's
  existing runners were used instead.
- No hosting resources, client secret or live Maps evaluation created/run yet.

## 8. Planned files

| File | Purpose |
|------|---------|
| `azure.yaml` | azd service, authentication-compatible lifecycle and safe packaging hooks |
| `infra/` | Subscription entry point, reused resource-group resources, vault/monitoring and azd parameters |
| `scripts/` | Reuse allowlisted packaging; preserve custom path and add only required azd integration |
| `.gitignore` | Ignore azd environment credentials/state while retaining this plan |
| `README.md`, `docs/deployment.md` | Document both workflows, checks and cost/privacy limitations |

No commits, broad deletion, production claim, or customer-data publication is
included in this plan.

## 9. Next step

Obtain approval for this completed plan, then execute preparation with the
existing CLI identity. Any permission, capacity, policy or pricing blocker must
be reported explicitly rather than replaced with a success-shaped fallback.
