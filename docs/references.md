# Official implementation references

The implementation was grounded in the following Microsoft documentation. These references describe the service contracts, not evidence that Zava inputs resolve correctly.

| Subject | Source | Use in this POC |
| --- | --- | --- |
| Current forward geocoding | https://learn.microsoft.com/en-us/rest/api/maps/search/get-geocoding?view=rest-maps-2026-01-01 | Pin API `2026-01-01`; `query` versus structured parameter restrictions; GeoJSON, confidence, match codes, geometry |
| Current partial-address autocomplete | https://learn.microsoft.com/en-us/rest/api/maps/search/get-geocode-autocomplete?view=rest-maps-2026-01-01 | Required coordinates or bbox; optional country filter; address entity group; top 1–20 |
| Search walkthrough and service differences | https://learn.microsoft.com/en-us/azure/azure-maps/how-to-search-for-address | Distinguish geocoding, autocomplete, and legacy fuzzy search |
| Entra authentication and scope | https://learn.microsoft.com/en-us/azure/azure-maps/azure-maps-authentication | `https://atlas.microsoft.com/.default`, account `x-ms-client-id`, scoped RBAC |
| Official JavaScript Entra sample | https://learn.microsoft.com/en-us/javascript/api/overview/azure/maps-search-rest-readme?view=azure-node-preview#examples | DefaultAzureCredential and Maps account uniqueId conventions; this POC uses direct REST to pin the current API |
| Azure Maps resource contract | https://learn.microsoft.com/en-us/azure/templates/microsoft.maps/2023-06-01/accounts | Gen2/G2 account and `disableLocalAuth` |
| Maps Data Reader built-in role | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/web-and-mobile#azure-maps-data-reader | Role `423170ca-a8f6-4b0f-8487-9e4eb8f49bfa`, scoped to Maps account |
| App Service authentication resource | https://learn.microsoft.com/en-us/azure/templates/microsoft.web/2023-12-01/sites/config-authsettingsv2 | Single-tenant registration, default authorization policy and allowed groups |
| Geographic scope | https://learn.microsoft.com/en-us/azure/azure-maps/geographic-scope | Endpoint geography must be approved; does not replace a data-residency assessment |
| Maps pricing | https://azure.microsoft.com/en-us/pricing/details/azure-maps/ | Obtain current transaction rates and agreement-specific pricing before live runs |

## Tooling choices

- Node 22 LTS, ESM JavaScript, JSDoc checked with TypeScript.
- Native Node HTTP/fetch/test runner for minimal runtime dependencies.
- Azure Identity SDK for Entra/managed identity; no key-based auth.
- Cucumber for executable Gherkin and JUnit XML; Playwright for desktop/mobile acceptance.
- Vanilla HTML/CSS/JavaScript, same-origin modules and self-contained exported HTML.
- Bicep and PowerShell/Azure CLI for explicit, reviewable deployment.
- Shared Clawpilot light/dark theme tokens. The hosted page loads theme detection as a first-party module rather than an inline script to retain a strict `script-src 'self'` CSP. Exported HTML is self-contained and permits only the exact static theme script through a SHA-256 CSP hash.

The available Azure skills were discovered from the `microsoft/azure-skills` plugin directory. Relevant capabilities include `azure-app-onboard` (deployment planning/scaffolding), `azure-app-onboard-prereq` (readiness) and `azure-validate` (preflight validation). No Azure Maps-specific skill was found; the primary authority is the REST documentation above. Azure tooling was already available in this environment.

For another Copilot CLI environment, the discovered plugin name is **azure**, not its directory name:

```text
/plugin marketplace add microsoft/azure-skills
/plugin install azure@azure-skills
```

These optional agent-plugin commands are not application prerequisites and are not executed by the project.
