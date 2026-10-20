import { THEME_CSS, THEME_SCRIPT } from './theme.js';
import { categoryStrategyMetrics } from './evaluation.js';

/** @typedef {import('./contracts.js').Report} Report */
/** @typedef {import('./contracts.js').Metrics} Metrics */

/** @param {number|null} value */
export function percent(value) {
  return value === null ? 'Not measured' : `${(value * 100).toFixed(1)}%`;
}

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** @param {Report} report @param {boolean} [includeAddresses] @returns {Report} */
export function exportReport(report, includeAddresses = false) {
  if (includeAddresses) return structuredClone(report);
  return {
    schemaVersion: report.schemaVersion, runId: report.runId, createdAt: report.createdAt,
    summaryOnly: true, provenance: structuredClone(report.provenance),
    overall: structuredClone(report.overall), byStrategy: structuredClone(report.byStrategy)
  };
}

/** @param {unknown} value */
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** @param {Report} report */
export function resultsCsv(report) {
  if (!report.results) {
    const rows = Object.entries(report.byStrategy).map(([strategy, metrics]) => [strategy, metrics.total, metrics.labelled, metrics.coverage, metrics.top1Accuracy, metrics.topKAccuracy, metrics.errorRate]);
    return [['strategy', 'trials', 'labelled', 'coverage', 'top1Accuracy', 'topKAccuracy', 'errorRate'], ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  const headers = ['id', 'query', 'category', 'strategy', 'status', 'candidateCount', 'topAddress', 'confidence', 'top1Correct', 'topKCorrect', 'firstCorrectRank', 'durationMs', 'attempts', 'errorCode', 'manualDecision', 'reviewer', 'reviewNote', 'addressLine', 'locality', 'adminDistrict', 'postalCode', 'countryRegion', 'longitude', 'latitude'];
  const rows = (report.results ?? []).map(row => [
    row.case.id, row.case.query, row.case.category, row.strategy, row.status,
    row.candidates.length, row.candidates[0]?.formattedAddress, row.candidates[0]?.confidence,
    row.status === 'error' && row.evaluation.labelled ? false : row.evaluation.top1Correct,
    row.status === 'error' && row.evaluation.labelled ? false : row.evaluation.topKCorrect,
    row.evaluation.firstCorrectRank, row.durationMs.toFixed(2), row.attempts,
    row.error?.code, row.review?.decision, row.review?.reviewer, row.review?.note,
    row.candidates[0]?.address.addressLine, row.candidates[0]?.address.locality,
    row.candidates[0]?.address.adminDistrict, row.candidates[0]?.address.postalCode,
    row.candidates[0]?.address.countryRegion, row.candidates[0]?.position?.[0],
    row.candidates[0]?.position?.[1]
  ]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

/** @param {Metrics} metrics */
function metricCells(metrics) {
  return `<td>${metrics.total}</td><td>${metrics.labelled}</td><td>${percent(metrics.coverage)}</td><td>${percent(metrics.top1Accuracy)}</td><td>${percent(metrics.topKAccuracy)}</td><td>${percent(metrics.errorRate)}</td>`;
}

/** @param {Report} report */
export function renderHtmlReport(report) {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-UTcMdmfYhrObJvge0sgtEQTOFGt8350xLH0zqR0TfV8='">
<script>${THEME_SCRIPT}</script>
<title>Azure Maps address resolution results</title>
<style>${THEME_CSS}
body{font:16px "Segoe UI",Aptos,Calibri,-apple-system,BlinkMacSystemFont,sans-serif;color:var(--cp-text);background:var(--cp-bg);max-width:1200px;margin:3rem auto;padding:1.5rem}h1{font-size:2.5rem}aside{padding:1rem;background:var(--cp-highlight);border-left:4px solid var(--cp-accent);border-radius:10px}table{border-collapse:collapse;width:100%;background:var(--cp-surface);margin:1rem 0}th,td{text-align:left;padding:.8rem;border-bottom:1px solid var(--cp-border);overflow-wrap:anywhere}th{background:var(--cp-surface-soft)}code{overflow-wrap:anywhere;font-family:Consolas,"Courier New",Courier,monospace}small{color:var(--cp-text-muted)}@media print{body{background:var(--cp-surface);margin:0}}</style></head><body>
<p>Zava / AZURE MAPS POC</p><h1>Address resolution results.</h1>
<aside><strong>${e(report.provenance.evidence)}</strong><p>${report.summaryOnly ? 'Aggregate-only export. No addresses, case IDs, categories, or review notes included.' : 'Sensitive detailed evidence. Contains input addresses and adjudication notes. Do not publish without approval.'}</p></aside>
<p>Run ${e(report.runId)} / ${e(report.createdAt)} / API ${e(report.provenance.apiVersion)} / ${e(report.provenance.geography)}</p>
<p>Cases: ${report.provenance.caseCount}; top-k: ${report.provenance.options.top}; concurrency: ${report.provenance.options.concurrency}. SHA-256: <code>${e(report.provenance.datasetSha256)}</code></p>
<h2>Strategy comparison</h2><table><thead><tr><th>Strategy</th><th>Trials</th><th>Labelled</th><th>Coverage</th><th>Top-1</th><th>Top-k</th><th>Errors</th></tr></thead><tbody>
${Object.entries(report.byStrategy).map(([name, metrics]) => `<tr><th>${e(name)}</th>${metricCells(metrics)}</tr>`).join('')}</tbody></table>
<h2>Interpretation</h2><p>Coverage is not correctness. Accuracy uses independent expected answers only; unlabelled cases are excluded and labelled service errors count as failures. All supplied expected address components and distance requirements must agree. Manual acceptance is a separate measure. Autocomplete uses context and only requests address entities; geocode is unrestricted free-form. These are different strategies, not a controlled API-only comparison.</p>
<p>Latency includes local processing, token acquisition and retries; fixture latency is not Azure Maps latency. Top-1 Wilson intervals are descriptive only; small, non-random or correlated samples do not establish population performance. No business pass/fail target has been assumed.</p>
${report.results ? `<h2>Results by category</h2><table><thead><tr><th>Category</th><th>Strategy</th><th>Trials</th><th>Labelled</th><th>Coverage</th><th>Top-1</th><th>Top-k</th><th>Errors</th></tr></thead><tbody>${categoryStrategyMetrics(report.results).map(group => `<tr><th>${e(group.category)}</th><td>${e(group.strategy)}</td>${metricCells(group.metrics)}</tr>`).join('')}</tbody></table>` : ''}
${report.results ? `<h2>Case evidence</h2><table><thead><tr><th>ID</th><th>Input</th><th>Strategy</th><th>Top candidate</th><th>Top-1</th><th>Review / error</th></tr></thead><tbody>${report.results.map(row => `<tr><td>${e(row.case.id)}</td><td>${e(row.case.query)}</td><td>${e(row.strategy)}</td><td>${e(row.candidates[0]?.formattedAddress ?? 'No candidate')}</td><td>${row.status === 'error' ? 'Error' : row.evaluation.top1Correct === null ? 'Unlabelled' : row.evaluation.top1Correct ? 'Correct' : 'Incorrect'}</td><td>${e(row.error?.code ?? row.review?.decision ?? 'Not reviewed')}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>Next steps</h2><p>Agree acceptance thresholds, run an approved Zava dataset with independently verified expected answers, inspect errors by category and country, and repeat on a separate test dataset before assessing suitability.</p>
<small>Generated by the Azure Maps engineering POC. No external assets, trackers or embedded credentials.</small></body></html>`;
}

/** @param {Report} report */
export function renderMarkdownReport(report) {
  const lines = [
    '# Azure Maps address resolution results', '', `**${report.provenance.evidence}**`, '',
    `Run: ${report.runId}; UTC: ${report.createdAt}; API: ${report.provenance.apiVersion}; cases: ${report.provenance.caseCount}.`,
    `Dataset SHA-256: ${report.provenance.datasetSha256}`, '',
    '| Strategy | Trials | Labelled | Coverage | Top-1 | Top-k | Errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
  ];
  for (const [name, metrics] of Object.entries(report.byStrategy)) {
    lines.push(`| ${name.replace(/[|\r\n]/g, ' ')} | ${metrics.total} | ${metrics.labelled} | ${percent(metrics.coverage)} | ${percent(metrics.top1Accuracy)} | ${percent(metrics.topKAccuracy)} | ${percent(metrics.errorRate)} |`);
  }
  lines.push('', '## Limits and next action', '',
    'Coverage is not correctness. Accuracy excludes unlabelled cases; labelled request errors are failures. Manual acceptance is reported separately. Fixture results and latency are not Azure findings. Autocomplete adds geographic context and filters to address entities, so strategy differences are not isolated API effects.',
    '', 'No Zava conclusions or business success thresholds have been assumed. Review an approved, independently labelled dataset before making a recommendation.',
    '', report.summaryOnly ? 'Aggregate-only export; detailed case evidence intentionally omitted.' : 'Detailed JSON/CSV evidence contains sensitive addresses and review notes; handle according to Zava policy.');
  return lines.join('\n');
}
