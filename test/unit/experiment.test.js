import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment } from '../../src/experiment.js';
import { exportReport, renderHtmlReport, renderMarkdownReport, resultsCsv } from '../../public/modules/reports.js';
import { addressCase, candidate } from '../helpers.js';

const provider = {
  mode: 'fixture', apiVersion: '2026-01-01', geography: 'none',
  search: async () => ({ candidates: [candidate()], attempts: 0, retryDelayMs: 0 })
};

test('experiments preserve order, provenance, full input digest, and separate strategies', async () => {
  const cases = [addressCase(), addressCase({ id: 'second', expected: undefined })];
  const run = await runExperiment(cases, provider);
  assert.equal(run.results.length, 4);
  assert.deepEqual(run.results.map(row => row.case.id), ['case-1', 'case-1', 'second', 'second']);
  assert.equal(run.provenance.mode, 'fixture');
  assert.equal(run.provenance.datasetSha256.length, 64);
  assert.equal(run.byStrategy.geocode.labelled, 1);
  assert.equal(run.byCategory.partial.total, 4);
  assert.equal(run.provenance.evidence, 'SIMULATED - NOT AZURE MAPS FINDINGS');
  const changed = await runExperiment([addressCase({ query: 'changed' })], provider);
  assert.notEqual(run.provenance.datasetSha256, changed.provenance.datasetSha256);
});

test('bounded concurrency and partial failures retain every observation', async () => {
  let active = 0;
  let peak = 0;
  const slow = {
    ...provider,
    search: async row => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      if (row.id === 'bad') throw Object.assign(new Error('Provider unavailable'), { code: 'HTTP_503', attempts: 3 });
      return { candidates: [], attempts: 1, retryDelayMs: 0 };
    }
  };
  const run = await runExperiment([addressCase(), addressCase({ id: 'bad' })], slow, { concurrency: 2 });
  assert.ok(peak <= 2);
  assert.equal(run.results.filter(row => row.status === 'error').length, 2);
  assert.equal(run.overall.errorRate, 0.5);
  assert.equal(run.results[2].error.code, 'HTTP_503');
});

test('all inputs validate before the provider is called and unknown exceptions propagate', async () => {
  let calls = 0;
  const broken = { ...provider, search: async () => { calls++; throw new Error('programming bug'); } };
  await assert.rejects(runExperiment([addressCase({ query: '' })], broken), /query/);
  assert.equal(calls, 0);
  await assert.rejects(runExperiment([addressCase()], broken), /programming bug/);
});

test('exports are aggregate-only by default; detailed evidence is explicitly opt-in', async () => {
  const run = await runExperiment([addressCase()], provider);
  const safe = exportReport(run);
  assert.equal(safe.summaryOnly, true);
  assert.equal(JSON.stringify(safe).includes('100 Example'), false);
  assert.equal(safe.results, undefined);
  assert.equal(exportReport(run, true).results.length, 2);
  assert.match(renderHtmlReport(safe), /SIMULATED/);
  assert.match(renderMarkdownReport(safe), /Top-1/);
});

test('HTML escapes untrusted addresses and CSV blocks formula injection', async () => {
  const input = addressCase({ id: '=1+1', query: '<img src=x onerror=alert(1)>' });
  const run = await runExperiment([input], provider);
  const html = renderHtmlReport(run);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  const csv = resultsCsv(run);
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes('query'));
  assert.equal(resultsCsv(exportReport(run)).includes('100 Example'), false);
});
