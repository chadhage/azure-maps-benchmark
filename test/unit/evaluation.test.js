import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidates, summarize, reviewResult, distanceMeters, normalizeText } from '../../public/modules/evaluation.js';
import { addressCase, candidate } from '../helpers.js';

function result(input, candidates, overrides = {}) {
  return {
    case: input, strategy: 'geocode', candidates, status: 'ok',
    durationMs: 100, attempts: 1, retryDelayMs: 0,
    evaluation: evaluateCandidates(input, candidates),
    ...overrides
  };
}

test('normalization is conservative, Unicode-aware, and never drops house numbers', () => {
  assert.equal(normalizeText('  100 EXAMPLE St. '), normalizeText('100 example st'));
  assert.notEqual(normalizeText('100 Example St'), normalizeText('101 Example St'));
  assert.notEqual(normalizeText('St John'), normalizeText('Saint John'));
  assert.equal(normalizeText('\uFF11\uFF10\uFF10 Example'), normalizeText('100 Example'));
});

test('a correct lower-ranked candidate improves top-k but not top-1 accuracy', () => {
  const actual = evaluateCandidates(addressCase(), [candidate({ address: { addressLine: '999 Wrong St' } }), candidate({ rank: 2 })]);
  assert.equal(actual.top1Correct, false);
  assert.equal(actual.topKCorrect, true);
  assert.equal(actual.firstCorrectRank, 2);
  assert.equal(actual.comparisons[0].fields.addressLine, false);
});

test('confidence and hierarchy flags are diagnostic, not ground truth', () => {
  assert.equal(evaluateCandidates(addressCase(), [candidate({ confidence: 'Low', matchCodes: ['UpHierarchy'] })]).top1Correct, true);
  assert.equal(evaluateCandidates(addressCase(), [candidate({ address: { locality: 'Wrong' }, confidence: 'High' })]).top1Correct, false);
});

test('unlabelled cases remain unscored, including empty results', () => {
  const input = addressCase({ expected: undefined });
  assert.equal(evaluateCandidates(input, [candidate()]).top1Correct, null);
  assert.equal(evaluateCandidates(input, []).topKCorrect, null);
});

test('empty results fail positive truth and satisfy an explicit no-match control', () => {
  assert.equal(evaluateCandidates(addressCase(), []).top1Correct, false);
  const negative = addressCase({ expected: { noMatch: true, source: 'Synthetic negative' } });
  assert.equal(evaluateCandidates(negative, []).top1Correct, true);
  assert.equal(evaluateCandidates(negative, [candidate()]).topKCorrect, false);
});

test('distance uses longitude-latitude ordering, includes the boundary, and requires all truth criteria', () => {
  assert.equal(distanceMeters([0, 0], [0, 0]), 0);
  assert.ok(Math.abs(distanceMeters([0, 0], [0, 1]) - 111195) < 5);
  const input = addressCase({ expected: { source: 'Survey', position: [0, 0], toleranceMeters: 100 } });
  assert.equal(evaluateCandidates(input, [candidate({ position: [0, 0] })]).top1Correct, true);
  assert.equal(evaluateCandidates(input, [candidate({ position: [0, 1] })]).top1Correct, false);
  input.expected.address = { locality: 'Other' };
  assert.equal(evaluateCandidates(input, [candidate({ position: [0, 0] })]).top1Correct, false);
  assert.equal(evaluateCandidates(input, [candidate({ position: null })]).top1Correct, false);
});

test('metrics expose denominators, include labelled errors as failures, and use null for no labels', () => {
  const rows = [
    result(addressCase(), [candidate()]),
    result(addressCase({ id: 'unknown', expected: undefined }), [candidate()]),
    result(addressCase({ id: 'error' }), [], { status: 'error', error: { code: 'HTTP_429', message: 'Rate limited' } })
  ];
  const metrics = summarize(rows);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.labelled, 2);
  assert.equal(metrics.top1Accuracy, 0.5);
  assert.equal(metrics.coverage, 2 / 3);
  assert.equal(metrics.errorRate, 1 / 3);
  assert.equal(metrics.unlabelled, 1);
  assert.equal(metrics.top1Interval95.low < 0.5, true);
  assert.equal(summarize([rows[1]]).top1Accuracy, null);
  assert.equal(summarize([]).coverage, null);
  assert.equal(summarize([]).latency.p95Ms, null);
});

test('latency percentiles are nearest-rank and never interpolate a fictitious observation', () => {
  const metrics = summarize([10, 20, 30, 40, 50].map(durationMs => result(addressCase(), [], { durationMs })));
  assert.equal(metrics.latency.p50Ms, 30);
  assert.equal(metrics.latency.p95Ms, 50);
});

test('manual decisions are separate from automated correctness and require an audit identity', () => {
  const row = result(addressCase({ expected: undefined }), [candidate()]);
  const reviewed = reviewResult(row, { decision: 'accepted', reviewer: 'Analyst A', note: 'Checked independently' });
  assert.equal(reviewed.review.decision, 'accepted');
  assert.equal(row.review, undefined);
  assert.equal(summarize([reviewed]).top1Accuracy, null);
  assert.equal(summarize([reviewed]).manualAcceptanceRate, 1);
  assert.throws(() => reviewResult(row, { decision: 'accepted', reviewer: '' }), /reviewer/);
  assert.throws(() => reviewResult(row, { decision: 'maybe', reviewer: 'A' }), /decision/);
  assert.throws(() => reviewResult({ ...row, status: 'error' }, { decision: 'accepted', reviewer: 'A' }), /error/);
  assert.throws(() => reviewResult({ ...row, candidates: [] }, { decision: 'accepted', reviewer: 'A' }), /candidate/);
});
