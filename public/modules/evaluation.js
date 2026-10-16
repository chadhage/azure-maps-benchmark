import { PocError } from './errors.js';

/** @typedef {import('./contracts.js').AddressCase} AddressCase */
/** @typedef {import('./contracts.js').Candidate} Candidate */
/** @typedef {import('./contracts.js').Evaluation} Evaluation */
/** @typedef {import('./contracts.js').Result} Result */
/** @typedef {import('./contracts.js').Metrics} Metrics */

/** @param {string} value */
export function normalizeText(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[.,]/g, ' ').replace(/\s+/gu, ' ').trim();
}

/** @param {[number,number]} left @param {[number,number]} right */
export function distanceMeters(left, right) {
  const radians = Math.PI / 180;
  const dLat = (right[1] - left[1]) * radians;
  const dLon = (right[0] - left[0]) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** @param {AddressCase} input @param {Candidate[]} candidates @returns {Evaluation} */
export function evaluateCandidates(input, candidates) {
  const truth = input.expected;
  if (!truth) return { labelled: false, top1Correct: null, topKCorrect: null, firstCorrectRank: null, comparisons: [] };
  if (truth.noMatch) return { labelled: true, top1Correct: candidates.length === 0, topKCorrect: candidates.length === 0, firstCorrectRank: null, comparisons: [] };
  const comparisons = candidates.map((candidate, index) => {
    /** @type {Record<string,boolean>} */
    const fields = {};
    for (const [key, value] of Object.entries(truth.address ?? {})) {
      const actual = candidate.address[/** @type {keyof import('./contracts.js').Address} */ (key)];
      fields[key] = typeof actual === 'string' && normalizeText(actual) === normalizeText(value);
    }
    const distance = truth.position && candidate.position ? distanceMeters(truth.position, candidate.position) : null;
    if (truth.position) fields.position = distance !== null && distance <= (truth.toleranceMeters ?? 0);
    return { rank: index + 1, correct: Object.values(fields).length > 0 && Object.values(fields).every(Boolean), fields, distanceMeters: distance };
  });
  return {
    labelled: true,
    top1Correct: comparisons[0]?.correct ?? false,
    topKCorrect: comparisons.some(value => value.correct),
    firstCorrectRank: comparisons.find(value => value.correct)?.rank ?? null,
    comparisons
  };
}

/** @param {number} successes @param {number} n */
function interval(successes, n) {
  if (!n) return null;
  const z = 1.959963984540054;
  const p = successes / n;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** @param {Result[]} rows @returns {Metrics} */
export function summarize(rows) {
  const total = rows.length;
  const labelled = rows.filter(row => row.evaluation.labelled).length;
  const matched = rows.filter(row => row.status === 'ok' && row.candidates.length > 0).length;
  const errors = rows.filter(row => row.status === 'error').length;
  const top1Correct = rows.filter(row => row.status === 'ok' && row.evaluation.top1Correct === true).length;
  const topKCorrect = rows.filter(row => row.status === 'ok' && row.evaluation.topKCorrect === true).length;
  const manualReviewed = rows.filter(row => row.review && row.review.decision !== 'unresolved').length;
  const manualAccepted = rows.filter(row => row.review?.decision === 'accepted').length;
  const durations = rows.map(row => row.durationMs).sort((a, b) => a - b);
  /** @param {number} p */
  const percentile = p => durations.length ? durations[Math.ceil(p * durations.length) - 1] : null;
  return {
    total, labelled, unlabelled: total - labelled, matched, errors,
    coverage: total ? matched / total : null,
    errorRate: total ? errors / total : null,
    top1Correct, topKCorrect,
    top1Accuracy: labelled ? top1Correct / labelled : null,
    topKAccuracy: labelled ? topKCorrect / labelled : null,
    top1Interval95: interval(top1Correct, labelled),
    topKInterval95: interval(topKCorrect, labelled),
    manualReviewed, manualAccepted,
    manualUnresolved: rows.filter(row => row.review?.decision === 'unresolved').length,
    manualAcceptanceRate: manualReviewed ? manualAccepted / manualReviewed : null,
    httpAttempts: rows.reduce((sum, row) => sum + row.attempts, 0),
    latency: { p50Ms: percentile(0.5), p95Ms: percentile(0.95) }
  };
}

/**
 * @param {Result} row
 * @param {{decision:string,reviewer:string,note?:string}} input
 * @returns {Result}
 */
export function reviewResult(row, input) {
  if (!['accepted', 'rejected', 'unresolved'].includes(input.decision)) throw new PocError('INVALID_REVIEW', 'Review decision must be accepted, rejected, or unresolved.');
  if (!input.reviewer.trim() || input.reviewer.length > 100) throw new PocError('INVALID_REVIEW', 'A reviewer identity of 1 to 100 characters is required.');
  if ((input.note?.length ?? 0) > 1000) throw new PocError('INVALID_REVIEW', 'Review note must be at most 1000 characters.');
  if (input.decision === 'accepted' && (row.status === 'error' || row.candidates.length === 0)) throw new PocError('INVALID_REVIEW', 'An error or no-candidate result cannot be accepted as a match.');
  const decision = input.decision === 'accepted' ? 'accepted' : input.decision === 'rejected' ? 'rejected' : 'unresolved';
  const review = { decision, reviewer: input.reviewer.trim(), note: input.note?.trim() ?? '', reviewedAt: new Date().toISOString() };
  return { ...row, review, reviewHistory: [...(row.reviewHistory ?? []), review] };
}

/** @param {Result[]} results @param {(result:Result)=>string} key */
export function summarizeGroups(results, key) {
  /** @type {Map<string,Result[]>} */
  const groups = new Map();
  for (const row of results) {
    const name = key(row);
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return Object.fromEntries([...groups].map(([name, rows]) => [name, summarize(rows)]));
}
