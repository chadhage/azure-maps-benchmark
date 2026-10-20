# Deployment and operations

## Status and scope

The dedicated demo infrastructure and Entra prerequisites have been provisioned.
The initial hosted callback 401 was traced to a missing login credential and a
vault made private by inherited policy. The approved repair adds a dedicated
VNet, delegated App Service integration subnet, Key Vault private endpoint and
private DNS. Vault public access stays disabled; no policy exception is used.
The repair deployment succeeded on 2026-10-19. App Service reports its login
credential reference as **Resolved**, health returns 200, and the user confirmed
a fresh hosted sign-in loads the harness. Anonymous site/API requests still
redirect to the configured tenant; the approved group restriction is unchanged.
Live was enabled with explicit user approval on 2026-10-20 UTC, keeping the
shared 30-attempt limit and consent requirement. Live acceptance is not yet
established; invitation emails have not been sent.

The demo button is gated by server live enablement, an active run and remaining
allowance, not by whether a previous live response has been observed. Refresh
the hosted page after a server-setting change. The local fixture server is a
separate environment and is not enabled by hosted configuration.

Browser POSTs use `Referrer-Policy: same-origin`: App Service cookie-authenticated
POST checks can reject requests when the referrer is suppressed. Cross-origin
requests still receive no referrer, and the backend retains exact Origin and
Sec-Fetch-Site checks. Empty/non-JSON platform errors are shown with HTTP status
instead of being obscured by JSON parsing exceptions. No CSRF/authentication
checks are disabled.
The code-only repair was deployed on 2026-10-20 02:57 UTC. Hosted health is 200
and the new referrer header is verified; anonymous API access remains denied.
After refreshing, the signed-in user confirmed location candidates and address
fields returned. **Demo 1a is user-verified**, and the POST failure is resolved
for that session. The user then confirmed every uploaded row returned an outcome
in a live CSV submission: **demo 1b is user-verified** at the per-row outcome
level. This is not a correctness/effectiveness evaluation; mocked tests and
health checks are not substitutes for live acceptance.

The current short-lived login credential expires **2026-10-26 06:15:23 UTC**.
Rotate it before then or sign-in will fail again. The secret was stored directly
in the dedicated Key Vault through an authenticated management resource request,
without local secret files or deployment parameters.

The first application deployment built successfully but failed startup because
ARM serialized a boolean app setting as `False`. The template now explicitly
emits lowercase `true`/`false` to match strict runtime validation.
Local Bicep compilation is not proof of Azure policy compliance or regional
capacity. Use the approved Azure CLI login for remote validation.

The template targets an **existing resource group**. It creates:

- Gen2/G2 Azure Maps, global resource location, local/key authentication disabled.
- B1 Linux App Service plan and Node 22 LTS web app with HTTPS/TLS and basic publishing credentials disabled.
- System-assigned app identity with Azure Maps Data Reader scoped to this Maps account.
- Key Vault Secrets User role on an existing RBAC-enabled authentication Key Vault.
- Single-tenant Entra App Service authentication, restricted to one approved group; only `/healthz` is unauthenticated.
- A $100 monthly resource-group cost budget with 80% and 100% email notifications.

The budget is an alert only, **not a spending stop**. It does not prevent costs from exceeding $100, may be delayed, and does not replace a bounded Maps request plan or review of current agreement-specific pricing.

Authentication uses an existing single-tenant **web** application registration and an existing client secret stored in Key Vault. This Entra login credential is separate from Maps data access, which uses managed identity. No secret values are committed, passed to Bicep, returned as outputs or exposed in the browser.

This is intentionally a simple single-instance POC. The dedicated deployment
includes private Key Vault connectivity, not an enterprise landing zone, WAF,
distributed job queue, multi-region availability, data-retention service or
production compliance controls.

### Private authentication vault

The subscription wrapper creates an isolated VNet, with a /26 delegated
`Microsoft.Web/serverFarms` integration subnet and a separate private-endpoint
subnet. The `privatelink.vaultcore.azure.net` zone is linked only to this VNet.
Linux App Service routes outbound traffic through the VNet so Key Vault
references can resolve privately using its system identity. No inbound private
endpoint is placed on the web app: users still reach the HTTPS site through
tenant/group-restricted Easy Auth.

VNet integration requires Basic or higher; do not downgrade this plan to F1.
The login credential is separate from Maps managed-identity access. Rotate it
before its policy-compliant expiry and force App Service Key Vault reference
refresh after rotation. Never place the credential in source, deployment
parameters, logs or application packages. Verify the reference reports
`Resolved`, then test a fresh interactive login; a health 200 is insufficient.
Private endpoint/DNS and B1 hosting incur charges while the demo is idle.

## Invite-only demo operations

Keep the approved email roster in ignored private configuration. Resolve each
email to its exact Entra object, or create a B2B invitation where approved. Add
only those objects to the dedicated security group. Never authorize whole email
domains or accept a client-supplied email as identity. Do not send invitation
emails with a demo link until the endpoint and access policy are ready.
Tenant cross-tenant access/consent policy can still require an administrator.

The app registration has an exact HTTPS callback and SecurityGroup claims.
Easy Auth requires a single-tenant login and the approved group. Test anonymous
and signed-in nonmember denial and an actual invitee's interactive sign-in;
configuration inspection alone does not prove those user journeys.

The subscription wrapper defaults `liveHttpAttemptLimit` to 30. The backend
reserves each live HTTP attempt (including retries) in a non-address ledger
before sending it. In App Service it is stored under persistent
`HOME/data/maps-demo-attempts.log`, outside the deployment package. Keep exactly
one instance and one Node server process; this is a serialized single-process
allowance, not a distributed quota. Do not scale out, enable overlapping live
slots or run multiple processes against that ledger.

For local capped operation, set `LIVE_HTTP_ATTEMPT_LIMIT=30` and
`LIVE_HTTP_ATTEMPT_LEDGER` to an approved persistent private path. `0` means no
cumulative cap and is only the original template's compatibility default.
Startup rejects corrupt ledgers. Write failures block subsequent reservations.
A crash may conservatively count an unsent reservation. Do not delete/reset the
ledger on restart/redeploy; back it up privately before authorized maintenance.
This request cap is separate from the $100 alert budget and the frozen pilot.

## Prerequisites requiring explicit approval

1. Select the approved tenant, subscription, region and resource group. Confirm G2 Maps transaction prices and B1 compute charges; costs vary by agreement. The public retail-price lookup did not return an exact B1/G2 estimate for this deployment.
2. Check Azure Policy, quota, regional capacity, Maps usage terms and endpoint geographic scope. Resource location `global` does not itself establish data residency.
3. Select a globally unique App Service name.
4. Create or obtain an approved, single-tenant Entra **web** registration and security group. Its web redirect URI must be exactly:

   `https://<web-app-name>.azurewebsites.net/.auth/login/aad/callback`

   Configure the enterprise application's assignment requirements/group membership with your identity administrator. Large-group/overage-token cases must be tested with real identities; this template does not resolve group membership through Microsoft Graph.
5. Store that application's client secret under a named secret in an existing RBAC-enabled Key Vault **in the target resource group**. The app must be able to reach the vault. The dedicated subscription wrapper supplies private network integration; the original resource-group template accepts `appIntegrationSubnetId` for an existing delegated subnet.
6. Confirm the deployer may create resources and role assignments at the Maps account and Key Vault scopes. Contributor alone does not necessarily permit role assignment creation.
7. Authorize the POC's existing Key Vault Secrets User grant; it applies at the vault scope. Prefer a dedicated authentication vault with no unrelated secrets, or tighten to a reviewed secret-level assignment before enterprise use.
8. Provide at least one budget-alert email address, install Azure CLI/Bicep and project packages, and complete offline verification.

The scripts do not create an Entra application, create a secret, change the active subscription, log in interactively, or create/delete an entire resource group. Budget notifications are not an enforced spending cap.

## Parameter preparation

```powershell
az login --tenant <tenant-id>
az account set --subscription <subscription-id>
Copy-Item .\infra\parameters.example.json .\data\private\deployment.parameters.json
```

Replace all placeholders. `enableLive` defaults to false. Set `mapsGeography` to the approved `global`, `us` or `eu` endpoint selection. The code's public-cloud endpoint allowlist deliberately does not accept arbitrary hostnames or claim sovereign-cloud support.

## GitHub Actions-only application deployment

The supported deployment path is [Verify and deploy](../.github/workflows/ci.yml).
No local application deployment is performed. Existing infrastructure is retained.

| Event | Verification | Deployment after verification |
|-------|--------------|-------------------------------|
| Push to `main` | Full offline gates on Linux and Windows | Automatically to the existing shared demo |
| Same-repository PR opened, reopened or updated | Full offline gates | Shared demo, after `chadhage` approves the `zava-demo-pr` environment |
| Fork PR | Full offline gates | Never; no Azure login job |
| Non-main branch push | Full offline gates | None; open a PR |
| Manual workflow dispatch | Full offline gates | None |

The workflow packages the checked-out event commit (the merge commit for a PR)
only after both verification jobs pass. It verifies the exact ZIP allowlist and
publishes that immutable run artifact. The deployment job does not check out or
run application scripts and receives OIDC permission only after environment
protection passes. It downloads only that run/attempt's package. The remote
App Service build installs runtime dependencies using its existing build setting.

The `zava-demo` environment permits only the `main` branch. The `zava-demo-pr`
environment permits `refs/pull/*/merge` and requires the owner's approval; review
the entire PR, especially workflow/dependency changes, before approving.
Self-approval is permitted so the sole current operator can rehearse their PRs.
Both targets use the same site; PRs **overwrite the live demo**, not a preview.
Deployments serialize without cancelling an in-progress deployment. GitHub may
replace older pending deployments in a concurrency group; the last deployed
approved commit wins, not necessarily main. Merge/revert via main to restore it.

Azure authentication uses dedicated registration `zava-maps-github-deploy`,
with no password or publish-profile secret. Two exact federated subjects trust
only this repository's `zava-demo` and `zava-demo-pr` environments, issuer
`https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`.
The service principal has Website Contributor **on this web app only**, not
subscription, resource-group, Maps or vault access. This role can manage the app;
environment protections and review remain essential.

The repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
`AZURE_SUBSCRIPTION_ID` contain nonsecret identity metadata. Do not add a client
secret or reuse the interactive sign-in registration. Do not use
`pull_request_target` to run PR code with Azure permissions.

The deployment only uploads the application ZIP: no Bicep provisioning, app
setting/authentication changes, invitation operations or Maps calls. It does not
reset `/home/data/maps-demo-attempts.log` or expand the shared 30-attempt allowance.
Post-deploy checks require health and denial of anonymous API access; they do
not prove invitee sign-in or Maps correctness.

`scripts/deploy.ps1 -Apply` fails before Azure operations. The azd provisioning
and deployment hooks also reject the retired path. These are repository
safeguards, **not an Azure-wide denial**: existing Owner/Contributor users retain
their rights and can bypass scripts. Strict enforcement requires a separately
approved Azure RBAC/governance change; those rights have not been removed.

Workflow changes must be committed and pushed before automation is active.
The initial successful Actions deployment is the release acceptance gate.
Infrastructure updates require a separately reviewed Actions workflow; this
application workflow deliberately cannot provision resources or grant roles.

## Local validation only

```powershell
.\scripts\deploy.ps1 `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <existing-resource-group> `
  -ParameterFile .\data\private\deployment.parameters.json
```

This verifies the active subscription, Key Vault RBAC mode, Entra registration audience and callback, compiles Bicep and runs Azure **what-if**. It does not provision.

`-Apply` is disabled. Use the workflow above for application deployment, not
local Azure CLI or azd publishing.

The packaging allowlist includes application source/public assets, invented fixtures, the sample dataset and dependency manifests. It excludes private datasets, results, `.env`, session state, Git history and arbitrary repository files. Remote build restores runtime dependencies. A custom domain or different identity provider requires reviewed changes, not an unchecked redirect setting.

## Azure Developer CLI: retained infrastructure reference

The optional [azd configuration](../azure.yaml) uses the subscription-scope
[entry point](../infra/azd/main.bicep), while the existing resource-group
[template](../infra/main.bicep) remain available for review and validation.
Local provisioning/deployment is disabled by hooks; this section describes the
retained infrastructure and packaging, not an alternative deployment path.
It creates a dedicated resource group, authentication vault, Log Analytics
workspace and workspace-based Application Insights in addition to the existing
workbench resources. It grants the deployer Key Vault Secrets Officer on the
dedicated vault so the login credential can be stored there. It does not grant
the web app access to unrelated vaults.

The vault has RBAC and purge protection enabled. Only App Service platform
metrics are sent to the workspace. No application SDK, automatic dependency
tracing or HTTP request logging is enabled; creating an Application Insights
resource alone does not instrument the application. The workspace's 0.1-GB
daily ingestion cap is not an overall Azure spending stop.

Install Azure Developer CLI and PowerShell 7, then reuse an existing approved
Azure CLI login:

```powershell
azd config set auth.useAzCliAuth true
az account show
azd env new <environment-name> --no-prompt
azd env set AZURE_SUBSCRIPTION_ID <approved-subscription-id>
azd env set AZURE_TENANT_ID <approved-tenant-id>
azd env set AZURE_LOCATION centralus
azd env set AZURE_DEPLOYER_OBJECT_ID <signed-in-user-object-id>
azd env set BUDGET_ALERT_EMAIL <approved-recipient>
azd env set AZURE_MAPS_GEOGRAPHY global
azd env set AZURE_WEB_APP_NAME <approved-globally-unique-name>
azd env set ENTRA_APPLICATION_CLIENT_ID <single-tenant-web-client-id>
azd env set ALLOWED_ENTRA_GROUP_OBJECT_ID <approved-security-group-id>
```

The environment files under `.azure/` are ignored except for the deployment
plan. Never put a client-secret value in azd environment settings. Before
provisioning, complete the approved Entra registration/group prerequisites;
subscription Owner alone does not guarantee directory write permissions.
The web app name is explicitly supplied so its exact callback can be registered
before provisioning. Vault naming is generated deterministically by Bicep.

```powershell
azd package web --output-path .\artifacts\azd-web.zip --no-prompt
.\scripts\test-package.ps1 -ArchivePath .\artifacts\azd-web.zip
azd provision --preview --no-prompt
# Provisioning and deployment are disabled locally. Use the reviewed Actions path.
```

The service's prepackage hook calls the existing allowlisted packager and
stages only its contents into `artifacts/azd-app`; azd packages that directory,
not the repository. `test-package.ps1` checks the exact final zip inventory.
Live mode defaults to false and is not enabled by these commands.
Do not run `azd down` blindly: the new vault is purge-protected, and Entra
application/group lifecycle is separate from ARM resources.

In the current authoring environment, azd 1.36.0 packages successfully and
reports CLI authentication, but provision preview fails during subscription
discovery with `AzureCLICredential: exit status 1`. Direct CLI token requests
for the approved tenant succeed. This is an unresolved integration blocker,
not a successful Azure validation; do not provision through azd until its
preview succeeds. The Azure MCP azd tool may also require an IDE/server restart
after installation to pick up the new executable on PATH.

## Hosted verification

After deployment:

1. `/healthz` returns `{ "status": "ok", ... "mapsConnectivity": "not-checked" }`. This verifies process responsiveness only.
2. An anonymous request to the site is redirected to Entra sign-in, and an unauthenticated API call is not usable.
3. A real user in the approved group can sign in and use fixtures. A user outside the group cannot.
4. Check that the Key Vault app-setting reference resolved, and allow for RBAC propagation. Test group overage cases with your tenant's identities.
5. With data-owner approval, enable live mode in the approved parameter file and redeploy. Verify a small known labelled case and an independently verified no-match control.
6. Confirm managed-identity Maps permissions, account uniqueId, intended geography, request counts and expected billing.
7. Export evidence to an approved location. Do not automatically publish detailed case evidence or browser traces containing customer data.

No positive deployment/live verification is claimed until those steps are completed.

## Local and hosted controls

- Local server binds to loopback and rejects unexpected Host headers and cross-origin evaluation requests.
- Non-loopback binding requires the App Service environment and platform-authentication mode. The application trusts the App Service-injected principal header **only behind App Service**; it is not a general authentication gateway for other hosts.
- Hosted access relies on Easy Auth's principal/group validation; client-provided identity headers must never be trusted through an unrelated reverse proxy.
- Static routes are allowlisted; neither private data nor server source is served.
- One active evaluation per process, maximum four concurrent case/strategy tasks, three HTTP attempts per trial, ten-second request timeout and thirty-second cumulative retry-delay budget.
- HTTP 429/5xx and network failures may retry with exponential backoff/jitter. `Retry-After`/`x-ms-retry-after-ms` are honored. An excessive requested delay fails explicitly instead of retrying too early. Ordinary 4xx errors are not retried.
- Browser runs have a two-minute overall deadline; cancellation cannot retract a request already received by Azure and may still incur charges. No partial browser report is promised on cancellation/deadline. Use smaller batches or the CLI.
- No address/query/token logging is implemented. App Service, Azure infrastructure, browser traces, deployment history and your environment may still retain other data; review their retention policies.
- Health does not call Maps and therefore does not create billable probe traffic.
- Secret expiry and rotation are handled through the existing Key Vault/identity processes; versionless references can be refreshed using App Service's supported reference-refresh operation.

## Targeted cleanup

Preserve the deployment name and outputs from `az deployment group show --name <deployment> --resource-group <rg>`. Have the owner verify every resource ID before deletion.

Remove only resources created for this POC, in this order:

1. The reported Key Vault role assignment and Maps role assignment.
2. The reported web app.
3. The reported Maps account.
4. The reported dedicated App Service plan, after confirming it has no other apps.

Use `az role assignment delete --ids <exact-role-assignment-id>` and `az resource delete --ids <exact-resource-id>` with reviewed IDs. Do **not** delete the existing Key Vault, its secrets, the Entra registration/group, or the entire shared resource group. No broad cleanup command is included.

Keep or remove local detailed reports only according to the approved retention policy; Git ignore rules are not an encryption or access-control boundary.
