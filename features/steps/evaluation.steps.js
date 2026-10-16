import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFixtures } from '../../src/runtime.js';
import { runExperiment } from '../../src/experiment.js';
import { evaluateCandidates } from '../../public/modules/evaluation.js';
import { exportReport } from '../../public/modules/reports.js';
import { addressCase, candidate } from '../../test/helpers.js';

Given('the invented mixed-label sample dataset', async function () {
  this.dataset = JSON.parse(await readFile(new URL('../../data/sample-addresses.json', import.meta.url), 'utf8'));
});
When('I evaluate both search strategies offline', async function () {
  this.report = await runExperiment(this.dataset, await loadFixtures());
});
Then('there are {int} observations and {int} labelled observations', function (total, labelled) {
  assert.equal(this.report.overall.total, total);
  assert.equal(this.report.overall.labelled, labelled);
});
Then('top-1 correctness is {int} percent', function (percentage) {
  assert.equal(this.report.overall.top1Accuracy * 100, percentage);
});
Then('candidate coverage is {float} percent', function (percentage) {
  assert.equal(this.report.overall.coverage * 100, percentage);
});
Then('the report clearly says that evidence is simulated', function () {
  assert.match(this.report.provenance.evidence, /SIMULATED - NOT AZURE MAPS FINDINGS/);
});
Then('no paid HTTP attempts have occurred', function () {
  assert.equal(this.report.overall.httpAttempts, 0);
});
Given('an expected street of {string}', function (street) {
  this.input = addressCase({ expected: { address: { addressLine: street }, source: 'Independent synthetic oracle' } });
});
When('the provider returns {string} with high confidence', function (street) {
  this.evaluation = evaluateCandidates(this.input, [candidate({ address: { addressLine: street }, confidence: 'High' })]);
});
Then('top-1 correctness is false', function () { assert.equal(this.evaluation.top1Correct, false); });
When('an incorrect candidate precedes the correct candidate', function () {
  this.evaluation = evaluateCandidates(this.input, [candidate({ address: { addressLine: '999 Wrong St' } }), candidate({ rank: 2 })]);
});
Then('top-k correctness is true', function () { assert.equal(this.evaluation.topKCorrect, true); });
Given('an unlabelled address', function () { this.input = addressCase({ expected: undefined }); });
When('a plausible candidate is returned', function () { this.evaluation = evaluateCandidates(this.input, [candidate()]); });
Then('automated correctness is not measured', function () {
  assert.equal(this.evaluation.top1Correct, null);
  assert.equal(this.evaluation.topKCorrect, null);
});
When('I export with default privacy settings', function () { this.export = exportReport(this.report); });
Then('no query text or case evidence is present', function () {
  assert.equal(this.export.results, undefined);
  assert.equal(JSON.stringify(this.export).includes('Example St'), false);
  assert.equal(this.export.summaryOnly, true);
});
