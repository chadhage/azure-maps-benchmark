# Azure Maps address efficacy POC for Zava

An engineering POC for testing Azure Maps address resolution with complete, partial, misspelled and ambiguous inputs. It includes a web test harness, downloadable reports, a command-line evaluator, simulated responses, automated tests, Bicep templates and a GitHub Actions deployment workflow.

**There are no live Azure Maps or Zava efficacy findings yet.** The eight included addresses and responses are invented fixtures. Their deliberately mixed results demonstrate the measurement workflow, not Azure's capabilities. Do not use fixture percentages in a customer recommendation.

## Start locally

Prerequisite: Node.js **22.21.0 or later**. Use Node 22 LTS for the checked deployment configuration.

```powershell
npm install
npm start
```

Open **http://127.0.0.1:3000** and select **Run offline sample**. The offline harness and fixture CLI also run directly with Node without installed packages; dependencies are needed for live Entra authentication and the additional quality tools.

```powershell
node .\src\server.js
node .\src\cli.js --input .\data\sample-addresses.json --mode fixture --out .\results\demo
```

The CLI writes a unique run directory containing self-contained `index.html`, `report.json`, `results.csv` and `findings.md`. Outputs are aggregate-only by default.

## Live demos 1a and 1b

In **Evaluation lab → Live address demo**, use **1a / Single location** to
enter one location candidate, or **1b / CSV batch** to upload your own addresses.
The live demo is disabled until the server is configured for Azure Maps.
Explicit data-submission consent is required; submitting never uses fixtures.

Batch files must be **headerless CSV with exactly one field per nonblank row**:

```csv
"YOUR FIRST ADDRESS, INCLUDING ANY COMMAS"
"YOUR SECOND ADDRESS"
```

Do not supply IDs, column names or truth metadata. Quote addresses containing
commas using normal CSV escaping. The harness generates internal row IDs and
orchestrates individual geocoding requests; it does not use the Maps batch API.
Limits are 200 addresses, 500 characters per address and 1 MiB per upload.

The findings page shows each row's candidates, no-match or explicit request
error. Select a row to see returned address line, locality, state/district,
postal code, country/region, coordinates and provider diagnostics. Missing
fields are labelled, not invented. Detailed CSV/JSON exports require the
address-inclusion opt-in. A returned candidate is not proof of correctness.

The hosted demo is public: anyone with the URL can open it and submit single
addresses or CSV batches without signing in. All visitors share **30 HTTP
attempts**, including
retries and attempts from the advanced lab, persisted across restarts. The
remaining count is shown in the demo panel. Exhaustion requires owner review;
there is no browser reset. The original frozen evaluation pilot is separate.
See [deployment and access operations](docs/deployment.md).
Visitors can exhaust the remaining allowance; this is not a per-user quota.
Only submit addresses you are authorized to process. The site does not expose
other visitors' results or a shared report history.

## Add your evaluation address list

Put approved input under **[data/private/](data/private/)**. This directory is ignored by Git except for its placeholder; it is also excluded from application deployment packages. Do not place customer data in the public assets or fixture directories.

- Use [the CSV template](data/addresses.template.csv), or a JSON array / versioned envelope matching [the dataset schema](schemas/addresses.schema.json).
- Required fields: `id` and `query`. Optional: `category`, input `countryRegion`, input `coordinates: [longitude, latitude]`, and independent `expected`.
- Cases without `expected` remain unlabelled. They contribute to coverage and review workload, **not automated accuracy**.
- Labelled cases require a self-declared `expected.source` and at least one address field, coordinates with an explicit `toleranceMeters`, or `noMatch: true`. Truth sources are not authenticated by this application.
- Maximum 200 cases, 500 characters per query, 1 MiB per browser/API request, 20 candidates, concurrency 1–4. For large files, split into disjoint batches and preserve their run IDs.

```json
{
  "schemaVersion": "1.0",
  "cases": [
    {
      "id": "zava-001",
      "query": "REPLACE WITH AN APPROVED PARTIAL ADDRESS",
      "category": "partial",
      "countryRegion": "US",
      "expected": {
        "address": { "addressLine": "INDEPENDENTLY VERIFIED STREET LINE" },
        "source": "Approved reference and verification date"
      }
    },
    {
      "id": "zava-002",
      "query": "REPLACE WITH AN APPROVED UNLABELLED ADDRESS",
      "category": "missing-postal-code"
    }
  ]
}
```

Loading/validating a file is local to the browser. Running sends the dataset to this backend. Live provider requests contain the query and input context only, never the `expected` answer. A fixture run with unseen case IDs/queries produces explicit fixture errors rather than fabricated matches.

## What the POC measures

| Measure | Definition |
| --- | --- |
| Candidate coverage | Successful trials with at least one candidate / all trials |
| Top-1 correctness | Labelled trials whose first candidate satisfies **all** supplied truth criteria / labelled trials |
| Top-k correctness | Labelled trials with any correct candidate among the requested k / labelled trials |
| Error rate | Request-error trials / all trials |
| Manual acceptance | Analyst-accepted top candidates / analyst accepted-or-rejected trials; separate from accuracy |
| Latency | Nearest-rank p50/p95 observed end-to-end duration, including token acquisition and retries |

Every case × strategy is a trial. Strategy-specific metrics are the primary comparison; overall cards are not counts of unique addresses. Labelled errors stay in the accuracy denominator as failures. Explicit no-match controls are scored separately per case but are included in accuracy; a high negative-control proportion can therefore increase the aggregate score. Inspect the detailed category breakdown before drawing conclusions.

The application records configuration, API version, geography, timestamp, run ID, normalized dataset SHA-256, ranked candidates, diagnostics, expected answers and optional manual review history. A digest establishes a reproducibility fingerprint, not source authenticity or tamper-proof auditability. Default exports intentionally omit case IDs, category names and review notes as well as addresses.

See [methodology](docs/methodology.md) for sampling, controls, leakage prevention, limitations and interpretation.

## Enable live evaluation deliberately

No subscription keys are used or accepted. Authentication is **Microsoft Entra ID**: `DefaultAzureCredential` locally and system-assigned `ManagedIdentityCredential` in App Service.

1. Obtain data-owner approval, the approved Azure Maps account/geography and permission to make billable requests.
2. Assign the analyst **Azure Maps Data Reader** at the Maps account scope. Get its account `properties.uniqueId` (not its Azure resource ID, subscription ID, or Entra application ID).
3. Sign in and configure the local process:

```powershell
az login --tenant <approved-tenant-id>
az account set --subscription <approved-subscription-id>
Copy-Item .\.env.example .\.env
# Edit .env: ENABLE_LIVE=true, AZURE_MAPS_CLIENT_ID=<account-uniqueId>,
# and AZURE_MAPS_GEOGRAPHY=global|us|eu as approved.
npm start
```

4. In the lab choose live mode and explicitly consent. There are **no per-keystroke API requests**. Both server enablement and per-run consent are required.

For a repeatable batch:

```powershell
npm run evaluate -- --input .\data\private\addresses.json --mode live --consent-live --strategies geocode,autocomplete --top 5 --concurrency 2 --out .\results\live
```

Add `--include-addresses` only when authorized to retain detailed evidence. CLI exit codes: **0** completed with no request errors; **1** invalid configuration/input or unexpected failure; **2** completed with per-case request errors. Wrong matches do not fail the process: no business pass/fail threshold has been assumed.

The live adapter uses Search **2026-01-01**:

- Free-form **`/geocode?query=...`**, without invalid structured-only country parameters.
- **`/geocode:autocomplete`**, limited to address entities, with explicit input coordinates or a documented world bounding box and optional input country filter.

These are different strategies, not a controlled API-only comparison. Geographic context and autocomplete's address-only filter can change results. Expected coordinates are never used as request hints. See [official references](docs/references.md) and [deployment guidance](docs/deployment.md).

## Quality gates

```powershell
npm run check
npm run test:coverage
npm run test:bdd
npx playwright install chromium
npm run test:acceptance
npm run infra:build
```

Or run `.\scripts\validate.ps1` after installing Chromium and Azure CLI/Bicep. None of these tests call Azure Maps or provision resources. The CI workflow runs offline on Windows and Linux and emits JUnit XML for BDD and acceptance tests.

- **TDD:** failing tests were established before implementing the evaluation core.
- **Unit/HTTP:** input contracts, CSV edge cases, truth comparisons, distance, denominator logic, reports, retry behavior, live consent, private-file isolation, and backend response shapes.
- **BDD:** [features/efficacy.feature](features/efficacy.feature), executable with Cucumber.
- **Acceptance:** [browser workbench scenarios](test/acceptance/workbench.spec.js), desktop and mobile Chromium.
- **Coverage:** at least 85% core lines/functions and 75% branches. Scope is explicitly the shared measurement modules and provider/experiment modules; this is not a claim of full UI/server coverage.

See [verification status](docs/verification.md) for checks actually executed in the authoring environment and remaining live-deployment checks.

## Deployment and operational boundaries

[Bicep](infra/main.bicep) provisions Gen2 Azure Maps with local/key auth disabled, a B1 Linux App Service plan, a system-assigned identity, Maps RBAC and HTTPS. The dedicated deployment uses `publicDemo=true` for anonymous access. The resource-group template defaults to restricted Entra/group access; its existing Key Vault reference and login identity are retained for rollback. No secret value is accepted by the template.

Deployment is opt-in and is not executed by CI:

Application deployment is **GitHub Actions only**, through
[Verify and deploy](.github/workflows/ci.yml). Every push and PR runs offline
quality gates. Passing main pushes deploy automatically; passing same-repository
PRs deploy to the shared demo only after the owner's environment approval.
Fork PRs and non-main branch pushes do not deploy. See
[deployment guidance](docs/deployment.md#github-actions-only-application-deployment).

```powershell
Copy-Item .\infra\parameters.example.json .\data\private\deployment.parameters.json
# Fill in all approved values and complete the Entra/Key Vault prerequisites.
.\scripts\deploy.ps1 -SubscriptionId <id> -ResourceGroupName <existing-rg> -ParameterFile .\data\private\deployment.parameters.json
# Compilation + what-if only. -Apply is disabled; use GitHub Actions to deploy.
```

There are no automatic Azure deployments, secret registrations or role assignments during local startup. The backend has one active run per process, bounded concurrency/retries and a 2-minute browser-run deadline. It is a single-analyst POC, **not** a production bank address-validation platform. It does not verify mail deliverability, unit occupancy, identity, sanctions, legal addresses or regulatory compliance. Geocoding alone cannot establish those facts.

## Deliverables map

| Deliverable | Location |
| --- | --- |
| Source / CLI / live provider | [src/](src/) |
| Web test harness and results | [public/](public/) |
| Shared evaluation and report generation | [public/modules/](public/modules/) |
| BDD / TDD / unit / acceptance | [features/](features/), [test/](test/) |
| Invented fixtures / input template | [fixtures/](fixtures/), [data/](data/) |
| IaC and parameter template | [infra/](infra/) |
| Deployment / packaging / validation | [scripts/](scripts/) |
| CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| Methodology / operations / references | [docs/](docs/) |
