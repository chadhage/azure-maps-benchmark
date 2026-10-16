import { parseDataset, validateOptions } from './modules/dataset.js';
import { summarize, summarizeGroups, reviewResult } from './modules/evaluation.js';
import { exportReport, renderHtmlReport, renderMarkdownReport, resultsCsv, percent } from './modules/reports.js';
import { PocError, isObject } from './modules/errors.js';

/** @typedef {import('./modules/contracts.js').Report} Report */
/** @typedef {import('./modules/contracts.js').Result} Result */

/** @template {HTMLElement} T @param {string} id @param {new()=>T} ctor @returns {T} */
function element(id, ctor) {
  const value = document.getElementById(id);
  if (!(value instanceof ctor)) throw new Error(`Required UI element missing: ${id}`);
  return value;
}
/** @param {string} id */
const el = id => element(id, HTMLElement);
/** @param {string} id */
const input = id => element(id, HTMLInputElement);
/** @param {string} id */
const select = id => element(id, HTMLSelectElement);
/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] @param {string} [className] */
function node(tag, text = '', className = '') {
  const result = document.createElement(tag);
  result.textContent = text;
  result.className = className;
  return result;
}

/** @type {Report|null} */
let report = null;
/** @type {AbortController|null} */
let controller = null;
let selectedResult = -1;
let liveEnabled = false;
let format = /** @type {'json'|'csv'} */ ('json');
const editor = element('dataset-source', HTMLTextAreaElement);
const dialog = element('case-dialog', HTMLDialogElement);

/** @param {string} message @param {boolean} [error] */
function notify(message, error = false) {
  const notification = el('notification');
  notification.textContent = message;
  notification.className = `notification${error ? ' error' : ''}`;
  notification.hidden = false;
}

/** @param {unknown} error */
function showError(error) {
  console.error(error instanceof PocError ? error.code : error);
  notify(error instanceof Error ? error.message : 'Unexpected error. See the browser console.', true);
}

/** @param {()=>Promise<void>|void} action */
function perform(action) {
  Promise.resolve().then(action).catch(showError);
}

function navigate() {
  const page = location.hash.slice(1) || 'overview';
  const active = ['overview', 'lab', 'findings'].includes(page) ? page : 'overview';
  for (const id of ['overview', 'lab', 'findings']) el(id).hidden = id !== active;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.getAttribute('data-nav') === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (page === 'methodology') el('methodology').scrollIntoView();
  else window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', navigate);

/** @param {string} path @param {RequestInit} [init] @returns {Promise<unknown>} */
async function api(path, init) {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) {
    const error = isObject(body) && isObject(body.error) ? body.error : {};
    throw new PocError(typeof error.code === 'string' ? error.code : 'REQUEST_FAILED', typeof error.message === 'string' ? error.message : `Server returned HTTP ${response.status}.`);
  }
  return body;
}

function dataset() {
  return parseDataset(editor.value, format);
}

function options() {
  const strategy = select('strategy').value;
  return validateOptions({
    strategies: strategy === 'both' ? ['geocode', 'autocomplete'] : [strategy],
    top: Number(input('top').value),
    concurrency: Number(input('concurrency').value)
  });
}

function updateBudget() {
  const count = dataset().length;
  el('request-budget').textContent = String(select('mode').value === 'live' ? count * options().strategies.length * 3 : 0);
}

function validate() {
  const cases = dataset();
  const labelled = cases.filter(row => row.expected).length;
  el('dataset-summary').textContent = `${cases.length} cases / ${labelled} independently labelled / ${cases.length - labelled} unlabelled. Valid input; truth sources are self-declared, not authenticated.`;
  updateBudget();
  return cases;
}

async function loadSample() {
  const body = await api('/api/sample');
  format = 'json';
  select('format').value = 'json';
  editor.value = JSON.stringify(body, null, 2);
  input('dataset-file').value = '';
  validate();
}

async function run() {
  if (controller) throw new PocError('RUN_IN_PROGRESS', 'An evaluation is already running.');
  const cases = validate();
  const settings = options();
  const mode = select('mode').value;
  if (mode === 'live' && (!liveEnabled || !input('live-consent').checked)) throw new PocError('LIVE_CONSENT_REQUIRED', 'Live mode requires server configuration and explicit data-submission consent.');
  controller = new AbortController();
  const button = element('run-button', HTMLButtonElement);
  button.disabled = true;
  button.textContent = 'Evaluating...';
  el('cancel-button').hidden = false;
  notify(`Evaluating ${cases.length} cases with ${settings.strategies.length} strategies. ${mode === 'fixture' ? 'No Azure calls will be made.' : 'Approved queries are being sent to Azure Maps.'}`);
  try {
    const body = await api('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ mode, dataset: cases, options: settings, liveConsent: input('live-consent').checked })
    });
    // This response comes only from the same-origin application, not imported report files.
    if (!isObject(body) || body.schemaVersion !== '1.0' || !Array.isArray(body.results)) throw new PocError('INVALID_REPORT', 'The backend returned an invalid report.');
    report = /** @type {Report} */ (body);
    renderReport();
    location.hash = 'findings';
    notify(`${report.overall.total} observations completed; ${report.overall.errors} request errors. Export before reloading to preserve evidence.`);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') notify('Evaluation cancelled. Already submitted Azure calls may still be billed; no complete report was saved.');
    else throw error;
  } finally {
    controller = null;
    button.disabled = false;
    button.textContent = 'Run evaluation \u2192';
    el('cancel-button').hidden = true;
  }
}

/** @param {Result} row */
function outcome(row) {
  return row.status === 'error' ? 'error' : row.evaluation.top1Correct === null ? 'unlabelled' : row.evaluation.top1Correct ? 'correct' : 'incorrect';
}

function renderReport() {
  if (!report) return;
  el('empty-findings').hidden = true;
  el('report-content').hidden = false;
  const overall = report.overall;
  el('nav-count').textContent = String(overall.total);
  el('hero-cases').textContent = String(report.provenance.caseCount);
  el('hero-evidence').textContent = report.provenance.mode === 'fixture' ? 'Simulated fixtures only. No Azure or SMBC efficacy conclusion.' : 'Live observations collected. Review independent truth and failure categories.';
  el('evidence-banner').textContent = `${report.provenance.evidence}. ${report.provenance.mode === 'fixture' ? 'These results are manufactured to demonstrate the evaluation; they are not evidence of Azure performance.' : 'These observations describe this dataset and configuration only; they do not establish population efficacy.'}`;
  el('evidence-banner').className = `evidence-banner${report.provenance.mode === 'live' ? ' live' : ''}`;
  el('metric-coverage').textContent = percent(overall.coverage);
  el('coverage-denominator').textContent = `${overall.matched} / ${overall.total} case-strategy trials returned candidates`;
  el('metric-top1').textContent = percent(overall.top1Accuracy);
  el('accuracy-denominator').textContent = `${overall.top1Correct} / ${overall.labelled} labelled trials; ${overall.unlabelled} unlabelled excluded`;
  el('metric-topk').textContent = percent(overall.topKAccuracy);
  el('topk-note').textContent = `${overall.topKCorrect} / ${overall.labelled} labelled trials; k = ${report.provenance.options.top}`;
  el('metric-latency').textContent = overall.latency.p95Ms === null ? 'Not measured' : `${Math.round(overall.latency.p95Ms)} ms`;
  el('latency-note').textContent = report.provenance.mode === 'fixture' ? 'Local fixture overhead, NOT Azure latency' : 'Includes token acquisition, HTTP, processing and retries';
  const strategyRows = el('strategy-rows');
  strategyRows.replaceChildren();
  for (const [name, metrics] of Object.entries(report.byStrategy)) {
    const row = node('tr');
    for (const value of [
      name === 'geocode' ? 'Free-form geocode' : 'Address autocomplete',
      percent(metrics.coverage), percent(metrics.top1Accuracy), percent(metrics.topKAccuracy),
      String(metrics.labelled), metrics.top1Interval95 ? `${percent(metrics.top1Interval95.low)} - ${percent(metrics.top1Interval95.high)}` : 'Not measured',
      `${metrics.errors} / ${metrics.total}`, `${metrics.manualAccepted} / ${metrics.manualReviewed}`
    ]) row.append(node('td', value));
    strategyRows.append(row);
  }
  const categoryFilter = select('category-filter');
  const previous = categoryFilter.value;
  categoryFilter.replaceChildren(new Option('All categories', ''));
  for (const category of Object.keys(report.byCategory ?? {})) categoryFilter.append(new Option(category, category));
  categoryFilter.value = previous;
  if (categoryFilter.selectedIndex < 0) categoryFilter.value = '';
  el('run-provenance').textContent = `RUN ${report.runId}\nUTC ${report.createdAt}\nAPI ${report.provenance.apiVersion} / GEOGRAPHY ${report.provenance.geography}\nDATASET SHA-256 ${report.provenance.datasetSha256}`;
  renderCases();
}

function renderCases() {
  if (!report?.results) return;
  const search = input('case-search').value.toLocaleLowerCase();
  const category = select('category-filter').value;
  const filter = select('outcome-filter').value;
  const body = el('case-rows');
  body.replaceChildren();
  let count = 0;
  report.results.forEach((result, index) => {
    if (search && !`${result.case.id} ${result.case.query}`.toLocaleLowerCase().includes(search)) return;
    if (category && result.case.category !== category) return;
    const state = outcome(result);
    if (filter && state !== filter) return;
    count++;
    const row = node('tr');
    const identity = node('td');
    const button = node('button', result.case.id, 'case-button');
    button.type = 'button';
    button.addEventListener('click', () => openCase(index));
    identity.append(button, node('small', result.case.query));
    const candidate = result.candidates[0];
    const label = state === 'error' ? 'Request error' : state === 'unlabelled' ? 'Unlabelled' : state === 'correct' ? 'Correct' : 'Incorrect';
    const stateCell = node('td');
    stateCell.append(node('span', label, `outcome ${state}`));
    row.append(identity, node('td', result.strategy), node('td', candidate?.formattedAddress || (result.error?.code ?? 'No candidate')), stateCell, node('td', candidate?.confidence ?? 'Not supplied'), node('td', result.review?.decision ?? 'Not reviewed'));
    body.append(row);
  });
  el('result-count').textContent = `${count} of ${report.results.length} observations`;
  if (!count) { const row = node('tr'); const cell = node('td', 'No cases match these filters.'); cell.colSpan = 6; row.append(cell); body.append(row); }
}

/** @param {number} index */
function openCase(index) {
  const result = report?.results?.[index];
  if (!result) return;
  selectedResult = index;
  el('case-title').textContent = `${result.case.id} / ${result.strategy}`;
  el('case-query').textContent = result.case.query;
  el('case-truth').textContent = result.case.expected ? `Independent expected answer (self-declared):\n${JSON.stringify(result.case.expected, null, 2)}` : 'No independent expected answer. This case is not included in automated accuracy.';
  const details = el('candidate-details');
  details.replaceChildren();
  if (result.error) details.append(node('p', `${result.error.code}: ${result.error.message}`));
  if (!result.candidates.length) details.append(node('p', 'No candidates returned. No-match is not the same as a request failure.'));
  for (const candidate of result.candidates) {
    const card = node('article', '', 'candidate-card');
    card.append(node('h3', `#${candidate.rank} ${candidate.formattedAddress || 'Address text not supplied'}`));
    card.append(node('p', `Confidence: ${candidate.confidence ?? 'not supplied'} / Match codes: ${candidate.matchCodes.join(', ') || 'not supplied'} / Type: ${candidate.entityType ?? 'not supplied'}`));
    card.append(node('p', `Coordinates [longitude, latitude]: ${candidate.position?.join(', ') ?? 'not supplied'} / Method: ${candidate.calculationMethod ?? 'not supplied'}`));
    const comparison = result.evaluation.comparisons[candidate.rank - 1];
    card.append(node('small', comparison ? `Truth comparison: ${comparison.correct ? 'correct' : 'incorrect'} / ${JSON.stringify(comparison.fields)}${comparison.distanceMeters !== null ? ` / ${comparison.distanceMeters.toFixed(1)} m from expected` : ''}` : 'No candidate-level independent truth comparison'));
    details.append(card);
  }
  select('review-decision').value = result.review?.decision ?? 'unresolved';
  input('reviewer').value = result.review?.reviewer ?? '';
  element('review-note', HTMLTextAreaElement).value = result.review?.note ?? '';
  el('review-status').textContent = result.review ? `Last review ${result.review.reviewedAt}; ${result.reviewHistory?.length ?? 1} recorded decision(s).` : '';
  dialog.showModal();
}

function saveReview() {
  if (!report?.results || selectedResult < 0) throw new PocError('NO_CASE', 'Select a case before reviewing.');
  report.results[selectedResult] = reviewResult(report.results[selectedResult], {
    decision: select('review-decision').value, reviewer: input('reviewer').value,
    note: element('review-note', HTMLTextAreaElement).value
  });
  report.overall = summarize(report.results);
  report.byStrategy = summarizeGroups(report.results, row => row.strategy);
  report.byCategory = summarizeGroups(report.results, row => row.case.category);
  renderReport();
  el('review-status').textContent = 'Review saved in memory. Automated accuracy is unchanged. Export detailed JSON to preserve the decision history.';
}

function download() {
  if (!report) throw new PocError('NO_REPORT', 'Run an experiment before exporting.');
  const output = exportReport(report, input('include-addresses').checked);
  const kind = select('export-format').value;
  let text;
  if (kind === 'html') text = renderHtmlReport(output);
  else if (kind === 'json') text = JSON.stringify(output, null, 2);
  else if (kind === 'csv') text = resultsCsv(output);
  else text = renderMarkdownReport(output);
  const url = URL.createObjectURL(new Blob([text], { type: kind === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const link = node('a');
  link.href = url;
  link.download = `azure-maps-${output.provenance.mode}-${output.runId}.${kind}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(output.summaryOnly ? 'Aggregate report downloaded without addresses or review details.' : 'Detailed report downloaded. It contains sensitive address and review data; do not publish without approval.');
}

async function demo() {
  if (controller) throw new PocError('RUN_IN_PROGRESS', 'Wait for the current evaluation or cancel it.');
  await loadSample();
  select('mode').value = 'fixture';
  select('strategy').value = 'both';
  el('consent-panel').hidden = true;
  location.hash = 'lab';
  await run();
}

el('try-demo').addEventListener('click', () => perform(demo));
el('findings-demo').addEventListener('click', () => perform(demo));
el('load-sample').addEventListener('click', () => perform(loadSample));
el('validate-data').addEventListener('click', () => perform(() => { validate(); notify('Dataset is valid. No provider requests were made.'); }));
el('run-form').addEventListener('submit', event => { event.preventDefault(); perform(run); });
el('review-form').addEventListener('submit', event => { event.preventDefault(); perform(saveReview); });
el('cancel-button').addEventListener('click', () => controller?.abort());
el('close-dialog').addEventListener('click', () => dialog.close());
el('export-button').addEventListener('click', () => perform(download));
for (const id of ['case-search', 'category-filter', 'outcome-filter']) el(id).addEventListener('input', renderCases);
for (const id of ['strategy', 'top', 'concurrency']) el(id).addEventListener('change', () => perform(updateBudget));
select('mode').addEventListener('change', () => {
  const live = select('mode').value === 'live';
  el('consent-panel').hidden = !live;
  if (!live) input('live-consent').checked = false;
  perform(updateBudget);
});
select('format').addEventListener('change', () => { format = select('format').value === 'csv' ? 'csv' : 'json'; el('dataset-summary').textContent = 'Format changed. Validate before running.'; });
editor.addEventListener('input', () => { el('dataset-summary').textContent = 'Dataset changed. Validate before running.'; el('request-budget').textContent = 'Validate first'; });
input('dataset-file').addEventListener('change', () => perform(async () => {
  const file = input('dataset-file').files?.[0];
  if (!file) return;
  if (file.size > 1048576) throw new PocError('FILE_TOO_LARGE', 'File exceeds the 1 MiB limit.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension !== 'csv' && extension !== 'json') throw new PocError('INVALID_FORMAT', 'Choose a CSV or JSON file.');
  format = extension;
  select('format').value = format;
  editor.value = await file.text();
  validate();
}));

perform(async () => {
  navigate();
  const config = await api('/api/config');
  if (!isObject(config) || typeof config.liveEnabled !== 'boolean') throw new PocError('INVALID_CONFIG', 'Server configuration could not be read.');
  liveEnabled = config.liveEnabled;
  el('environment-label').textContent = liveEnabled ? 'Live available / opt-in' : 'Offline / fixtures';
  const option = select('mode').options[1];
  option.disabled = !liveEnabled;
  option.textContent = liveEnabled ? 'Live Azure Maps / consent required' : 'Live Azure Maps / disabled on server';
  if (liveEnabled) el('live-guidance').textContent = `Live is configured for ${String(config.geography)} geography, API ${String(config.apiVersion)}. Confirm data-owner approval and consent before running.`;
  await loadSample();
});
