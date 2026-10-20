import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAttemptBudget } from '../../src/attempt-budget.js';
import { createAzureProvider } from '../../src/providers.js';
import { addressCase } from '../helpers.js';

test('30-attempt allowance is serialized, persisted and survives restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'maps-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'attempts.log');
  const budget = await createAttemptBudget(30, path);
  const reservations = await Promise.allSettled(Array.from({ length: 40 }, () => budget.reserve()));
  assert.equal(reservations.filter(result => result.status === 'fulfilled').length, 30);
  assert.equal(reservations.filter(result => result.status === 'rejected').length, 10);
  assert.deepEqual(budget.snapshot(), { limit: 30, used: 30, remaining: 0 });
  assert.equal(await readFile(path, 'utf8'), 'attempt\n'.repeat(30));
  const restarted = await createAttemptBudget(30, path);
  await assert.rejects(restarted.reserve(), error => error.code === 'ATTEMPT_BUDGET_EXHAUSTED');
  assert.equal(restarted.snapshot().remaining, 0);
});

test('corrupt and unwritable ledgers fail closed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'maps-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'attempts.log');
  await writeFile(path, 'attempt\npartial');
  await assert.rejects(createAttemptBudget(30, path), error => error.code === 'INVALID_ATTEMPT_LEDGER');
  await writeFile(path, '');
  const budget = await createAttemptBudget(30, path);
  await rm(path);
  await rm(directory, { recursive: true });
  await assert.rejects(budget.reserve());
  await assert.rejects(budget.reserve(), error => error.code === 'ATTEMPT_LEDGER_UNAVAILABLE');
});

test('retries consume separate reservations and exhaustion never sends an extra request', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'maps-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const budget = await createAttemptBudget(1, join(directory, 'attempts.log'));
  let calls = 0;
  const provider = createAzureProvider({
    clientId: 'test', getToken: async () => 'test-token', reserveAttempt: budget.reserve,
    fetchImpl: async () => { calls++; return new Response('', { status: 503 }); },
    sleep: async () => {}
  });
  await assert.rejects(provider.search(addressCase(), { strategy: 'geocode', top: 5 }), error => error.code === 'ATTEMPT_BUDGET_EXHAUSTED' && error.attempts === 1);
  assert.equal(calls, 1);
  assert.equal(budget.snapshot().remaining, 0);
});
