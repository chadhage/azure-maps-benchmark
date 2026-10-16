import { createHash, randomUUID } from 'node:crypto';
import { validateDataset, validateOptions } from '../public/modules/dataset.js';
import { evaluateCandidates, summarize, summarizeGroups } from '../public/modules/evaluation.js';
import { PocError } from '../public/modules/errors.js';

/** @typedef {import('../public/modules/contracts.js').Result} Result */
/** @typedef {import('../public/modules/contracts.js').Provider} Provider */
/** @typedef {import('../public/modules/contracts.js').Report} Report */

/**
 * @param {unknown} input
 * @param {Provider} provider
 * @param {unknown} [settings]
 * @param {AbortSignal} [signal]
 * @returns {Promise<Report>}
 */
export async function runExperiment(input, provider, settings = {}, signal) {
  const cases = validateDataset(input);
  const options = validateOptions(settings);
  const tasks = cases.flatMap(row => options.strategies.map(strategy => ({ row, strategy })));
  /** @type {Result[]} */
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      if (signal?.aborted) throw new PocError('CANCELLED', 'Evaluation was cancelled.', 499);
      const index = cursor++;
      const { row, strategy } = tasks[index];
      const started = performance.now();
      try {
        const response = await provider.search(row, { strategy, top: options.top, signal });
        results[index] = {
          case: row, strategy, status: 'ok', ...response,
          durationMs: performance.now() - started,
          evaluation: evaluateCandidates(row, response.candidates)
        };
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        const known = error instanceof PocError || ('code' in error && typeof error.code === 'string' && /^HTTP_\d{3}$/.test(error.code));
        if (!known || (error instanceof PocError && error.code === 'CANCELLED')) throw error;
        const code = error instanceof PocError ? error.code : String('code' in error ? error.code : 'PROVIDER_ERROR');
        const attempts = 'attempts' in error && typeof error.attempts === 'number' ? error.attempts : 0;
        const retryDelayMs = error instanceof PocError ? error.retryDelayMs : 0;
        results[index] = {
          case: row, strategy, status: 'error', candidates: [],
          attempts, retryDelayMs, durationMs: performance.now() - started,
          evaluation: evaluateCandidates(row, []),
          error: { code, message: error instanceof PocError ? error.message : 'Azure Maps request failed.' }
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency, tasks.length) }, worker));
  return {
    schemaVersion: '1.0', runId: randomUUID(), createdAt: new Date().toISOString(), summaryOnly: false,
    provenance: {
      mode: provider.mode,
      evidence: provider.mode === 'fixture' ? 'SIMULATED - NOT AZURE MAPS FINDINGS' : 'LIVE AZURE MAPS OBSERVATIONS - INDEPENDENT TRUTH REQUIRED',
      apiVersion: provider.apiVersion, geography: provider.geography,
      datasetSha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
      caseCount: cases.length, options, applicationVersion: '1.0.0'
    },
    overall: summarize(results),
    byStrategy: summarizeGroups(results, row => row.strategy),
    byCategory: summarizeGroups(results, row => row.case.category),
    results
  };
}
