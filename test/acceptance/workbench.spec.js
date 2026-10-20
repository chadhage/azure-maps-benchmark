import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runExperiment } from '../../src/experiment.js';
import { candidate } from '../helpers.js';
import { PocError } from '../../public/modules/errors.js';

async function mockLiveDemo(page) {
  const submitted = [];
  await page.route('**/api/config', route => route.fulfill({ json: { liveEnabled: true, geography: 'global', apiVersion: '2026-01-01', attemptBudget: { limit: 30, used: 0, remaining: 30 } } }));
  await page.route('**/api/run', async route => {
    const body = route.request().postDataJSON();
    submitted.push(body);
    const result = await runExperiment(body.dataset, {
      mode: 'live', apiVersion: '2026-01-01', geography: 'global',
      async search(row) {
        if (row.query === 'Test error') throw new PocError('HTTP_503', 'Mocked provider failure', 502, 1);
        return { candidates: row.query === 'Test no match' ? [] : [candidate({ address: { addressLine: '1 Mock Street', locality: 'Testville', adminDistrict: 'NY', postalCode: '12345', countryRegion: 'US' } })], attempts: 1, retryDelayMs: 0 };
      }
    }, body.options);
    await route.fulfill({ json: result });
  });
  await page.goto('/#lab');
  await expect(page.locator('#demo-run')).toBeEnabled();
  return submitted;
}

test('demo 1a submits user input and shows structured fields (mocked API, not live evidence)', async ({ page }) => {
  const submitted = await mockLiveDemo(page);
  await page.locator('#demo-query').fill('User-supplied test address');
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('explicit data-submission consent');
  expect(submitted).toHaveLength(0);
  await page.locator('#demo-consent').check();
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('Demo 1a response received: 1 with candidates, 0 no-match, 0 errors');
  expect(submitted[0]).toMatchObject({ mode: 'live', liveConsent: true, dataset: [{ id: 'demo-1', query: 'User-supplied test address', category: 'demo' }], options: { strategies: ['geocode'], top: 5, concurrency: 1 } });
  await page.getByRole('button', { name: 'demo-1', exact: true }).click();
  for (const value of ['Address line', '1 Mock Street', 'Locality', 'Testville', 'State / district', 'NY', 'Postal code', '12345', 'Country / region', 'US', '-73.98, 40.75']) {
    await expect(page.locator('#candidate-details')).toContainText(value);
  }
});

test('demo 1b rejects multicolumn CSV then reports every address outcome (mocked API)', async ({ page }) => {
  const submitted = await mockLiveDemo(page);
  await page.locator('#demo-kind').selectOption('batch');
  await page.locator('#demo-consent').check();
  await page.locator('#demo-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Unquoted address, London') });
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('exactly one field');
  expect(submitted).toHaveLength(0);
  await page.locator('#demo-file').setInputFiles({ name: 'addresses.csv', mimeType: 'text/csv', buffer: Buffer.from('"User address, London"\nTest no match\nTest error\n') });
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('Demo 1b response received: 1 with candidates, 1 no-match, 1 errors');
  await expect(page.locator('#case-rows tr')).toHaveCount(3);
  expect(submitted[0].dataset.map(row => row.query)).toEqual(['User address, London', 'Test no match', 'Test error']);
  expect(submitted[0].dataset.every(row => row.expected === undefined)).toBe(true);
});

test('platform empty and non-JSON errors retain HTTP status instead of JSON parse failures', async ({ page }) => {
  await mockLiveDemo(page);
  await page.route('**/api/run', route => route.fulfill({ status: 403, body: '' }));
  await page.locator('#demo-query').fill('Test location');
  await page.locator('#demo-consent').check();
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('HTTP 403');
  await expect(page.locator('#notification')).not.toContainText('JSON');
  await page.route('**/api/run', route => route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' }));
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('HTTP 502');
  await expect(page.locator('#notification')).not.toContainText('Bad gateway');
});

test('same-origin demo POST retains referrer for platform cookie-authentication checks', async ({ page }) => {
  const submitted = await mockLiveDemo(page);
  let referrer;
  page.on('request', request => {
    if (request.url().endsWith('/api/run')) referrer = request.headers().referer;
  });
  await page.locator('#demo-query').fill('Test location');
  await page.locator('#demo-consent').check();
  await page.locator('#demo-run').click();
  await expect(page.locator('#notification')).toContainText('Demo 1a response received');
  expect(submitted).toHaveLength(1);
  expect(referrer).toBe('http://127.0.0.1:3100/');
});

async function runSample(page) {
  await page.goto('/');
  await expect(page.locator('#dataset-summary')).toContainText('8 cases');
  await page.getByRole('button', { name: 'Run offline sample', exact: true }).click();
  await expect(page.locator('#evidence-banner')).toContainText('SIMULATED');
  await expect(page.locator('#hero-evidence')).toContainText('These results do not measure Azure Maps accuracy for Zava.');
}

test('initial experience makes no fabricated efficacy claim and live is disabled', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Address Resolution | Zava Azure Maps POC');
  await expect(page.locator('.wordmark')).toContainText('Zava');
  await expect(page.locator('footer')).toContainText('Zava / AZURE MAPS EFFICACY POC');
  await expect(page.locator('#hero-evidence')).toContainText('Zava address-resolution accuracy has not been established.');
  await expect(page.getByRole('heading', { name: 'Azure Maps address resolution.' })).toBeVisible();
  await expect(page.locator('#hero-cases')).toHaveText('0');
  await expect(page.locator('#environment-label')).toHaveText('Offline / fixtures');
  await page.getByRole('link', { name: 'Findings 0', exact: true }).click();
  await expect(page.locator('#empty-findings')).toBeVisible();
  await page.getByRole('link', { name: 'New experiment' }).click();
  await expect(page.locator('#mode option[value=live]')).toBeDisabled();
});

test('offline experiment verifies exact metrics, denominators, filtering and lower-ranked truth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await runSample(page);
  await expect(page.locator('#metric-coverage')).toHaveText('68.8%');
  await expect(page.locator('#metric-top1')).toHaveText('50.0%');
  await expect(page.locator('#metric-topk')).toHaveText('66.7%');
  await expect(page.locator('#accuracy-denominator')).toContainText('6 / 12 labelled trials; 4 unlabelled excluded');
  await expect(page.locator('#case-rows tr')).toHaveCount(16);
  await expect(page.locator('#category-rows tr')).toHaveCount(16);
  await expect(page.locator('#category-rows tr').filter({ hasText: 'partial' }).filter({ hasText: 'geocode' })).toContainText('0.0%');
  await page.locator('#case-search').fill('ambiguous');
  await expect(page.locator('#case-rows tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'ambiguous', exact: true }).first().click();
  await expect(page.locator('#candidate-details')).toContainText('#2 10 Main St, East Example');
  await expect(page.locator('#candidate-details')).toContainText('Truth comparison: correct');
  await page.getByRole('button', { name: 'Close case details' }).click();
  expect(errors).toEqual([]);
});

test('manual review preserves independent accuracy and records a separate decision', async ({ page }) => {
  await runSample(page);
  await page.locator('#case-search').fill('international');
  await page.getByRole('button', { name: 'international', exact: true }).first().click();
  await page.locator('#review-decision').selectOption('accepted');
  await page.locator('#reviewer').fill('Acceptance analyst');
  await page.locator('#review-note').fill('Synthetic review only');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.locator('#review-status')).toContainText('Automated accuracy is unchanged');
  await page.getByRole('button', { name: 'Close case details' }).click();
  await expect(page.locator('#metric-top1')).toHaveText('50.0%');
  await expect(page.locator('#strategy-rows tr').first()).toContainText('1 / 1');
  await expect(page.locator('#case-rows tr').first()).toContainText('accepted');
});

test('default JSON export contains reproducibility metadata but no addresses', async ({ page }) => {
  await runSample(page);
  await page.locator('#export-format').selectOption('json');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await downloadPromise;
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(saved.summaryOnly).toBe(true);
  expect(saved.results).toBeUndefined();
  expect(saved.provenance.datasetSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(saved.provenance.mode).toBe('fixture');
  expect(saved.byStrategy.geocode.labelled).toBe(6);
  expect(JSON.stringify(saved)).not.toContain('Example St');
});

test('detailed evidence export is opt-in and preserves expected answers', async ({ page }) => {
  await runSample(page);
  await page.locator('#export-format').selectOption('json');
  await page.locator('#include-addresses').check();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await pending;
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(saved.summaryOnly).toBe(false);
  expect(saved.results).toHaveLength(16);
  expect(saved.results[0].case.expected.source).toContain('Invented');
});

test('invalid data is rejected before any experiment request', async ({ page }) => {
  await page.goto('/#lab');
  await expect(page.locator('#dataset-summary')).toContainText('8 cases');
  let requests = 0;
  page.on('request', req => { if (req.url().endsWith('/api/run')) requests++; });
  await page.locator('#dataset-source').fill('{bad JSON');
  await page.getByRole('button', { name: 'Run evaluation' }).click();
  await expect(page.locator('#notification')).toContainText('dataset JSON is invalid');
  expect(requests).toBe(0);
});

test('local fixtures and responsive UI produce no external requests or page-level overflow', async ({ page }) => {
  const external = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:3100')) external.push(req.url()); });
  await runSample(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(external).toEqual([]);
});

test('CSV upload is wired through validation, execution and exact labelled scoring', async ({ page }) => {
  await page.goto('/#lab');
  await expect(page.locator('#dataset-summary')).toContainText('8 cases');
  const csv = 'id,query,category,expectedAddressLine,expectedLocality,truthSource\r\ncomplete,"100 Example St, Testville 10001",complete,100 Example St,Testville,Invented fixture oracle\r\n';
  await page.locator('#dataset-file').setInputFiles({ name: 'approved-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#dataset-summary')).toContainText('1 cases / 1 independently labelled');
  await expect(page.locator('#format')).toHaveValue('csv');
  await page.getByRole('button', { name: 'Run evaluation' }).click();
  await expect(page.locator('#metric-top1')).toHaveText('100.0%');
  await expect(page.locator('#case-rows tr')).toHaveCount(2);
});

test('a no-candidate acceptance error is visible inside the case dialog', async ({ page }) => {
  await runSample(page);
  await page.locator('#case-search').fill('negative');
  await page.getByRole('button', { name: 'negative', exact: true }).first().click();
  await page.locator('#review-decision').selectOption('accepted');
  await page.locator('#reviewer').fill('Test analyst');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.locator('#review-status')).toContainText('no-candidate result cannot be accepted');
});

test('exported HTML works standalone with its CSP and explicit dark theme', async ({ page, context }, testInfo) => {
  await runSample(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await pending;
  const path = testInfo.outputPath('standalone-findings.html');
  await download.saveAs(path);
  const standalone = await context.newPage();
  const errors = [];
  standalone.on('pageerror', error => errors.push(error.message));
  await standalone.goto(`${pathToFileURL(path).href}?clawpilotTheme=dark`);
  await expect(standalone.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(standalone.getByRole('heading', { name: 'Address resolution results.' })).toBeVisible();
  await expect(standalone.locator('body')).toContainText('SIMULATED - NOT AZURE MAPS FINDINGS');
  expect(errors).toEqual([]);
});
