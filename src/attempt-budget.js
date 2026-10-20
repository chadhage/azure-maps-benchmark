import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PocError } from '../public/modules/errors.js';

/** @param {number} limit @param {string} path */
export async function createAttemptBudget(limit, path) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'a+', 0o600);
  let content;
  try { content = await readFile(path, 'utf8'); }
  finally { await handle.close(); }
  if (!/^(attempt\n)*$/.test(content)) throw new PocError('INVALID_ATTEMPT_LEDGER', 'Attempt ledger is invalid. Live requests are blocked; review the ledger rather than resetting it.', 503);
  let used = content.length / 'attempt\n'.length;
  let failed = false;
  let queue = Promise.resolve();
  return {
    snapshot: () => ({ limit, used, remaining: Math.max(0, limit - used) }),
    reserve() {
      const operation = queue.then(async () => {
        if (failed) throw new PocError('ATTEMPT_LEDGER_UNAVAILABLE', 'Attempt ledger could not be persisted. Live requests are blocked.', 503);
        if (used >= limit) throw new PocError('ATTEMPT_BUDGET_EXHAUSTED', 'The shared demo HTTP-attempt allowance is exhausted. Ask the demo owner to review usage.', 429);
        try {
          const file = await open(path, 'a', 0o600);
          try {
            await file.writeFile('attempt\n');
            await file.sync();
          } finally { await file.close(); }
          used++;
        } catch (error) {
          failed = true;
          throw error;
        }
      });
      queue = operation.then(() => {}, () => {
        // The caller receives the error; keep subsequent reservations serialized.
      });
      return operation;
    }
  };
}
