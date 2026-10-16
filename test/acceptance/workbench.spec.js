import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function runSample(page) {
  await page.goto('/');
  await expect(page.locator('#dataset-summary')).toContainText('8 cases');
  await page.getByRole('button', { name: 'Explore the sample' }).click();
  await expect(page.locator('#evidence-banner')).toContainText('SIMULATED');
}

test('initial experience makes no fabricated efficacy claim and live is disabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The hard addresses. The honest answers.' })).toBeVisible();
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
