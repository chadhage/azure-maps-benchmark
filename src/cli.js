import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { parseDataset } from '../public/modules/dataset.js';
import { exportReport, resultsCsv, renderHtmlReport, renderMarkdownReport } from '../public/modules/reports.js';
import { PocError } from '../public/modules/errors.js';
import { runExperiment } from './experiment.js';
import { loadFixtures, liveProvider } from './runtime.js';
import { readConfig } from './config.js';

const help = `Azure Maps efficacy evaluation
  npm run evaluate -- --input <CSV|JSON> [--mode fixture|live] [--out results]
    [--strategies geocode,autocomplete] [--top 5] [--concurrency 2]
    [--consent-live] [--include-addresses]

Defaults: fixture mode; aggregate-only exports; no address transmission.
Live requires ENABLE_LIVE=true, AZURE_MAPS_CLIENT_ID, Entra login/RBAC and --consent-live.
Detailed evidence requires --include-addresses. Never publish it without data-owner approval.
Exit codes: 0 completed without request errors; 1 invalid input/configuration; 2 case request errors.
`;

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.info(help);
  else {
    /** @type {Record<string,string|boolean>} */
    const flags = {};
    const booleanFlags = ['--consent-live', '--include-addresses'];
    const valueFlags = ['--input', '--mode', '--out', '--strategies', '--top', '--concurrency'];
    for (let i = 0; i < args.length; i++) {
      const name = args[i];
      if (Object.hasOwn(flags, name)) throw new PocError('INVALID_ARGUMENT', 'Duplicate CLI argument.');
      if (booleanFlags.includes(name)) flags[name] = true;
      else if (valueFlags.includes(name) && args[i + 1] && !args[i + 1].startsWith('--')) flags[name] = args[++i];
      else throw new PocError('INVALID_ARGUMENT', `Unknown argument or missing value: ${name}. Use --help.`);
    }
    if (typeof flags['--input'] !== 'string') throw new PocError('INPUT_REQUIRED', 'Provide --input. Use --help.');
    const inputPath = flags['--input'];
    const mode = flags['--mode'] ?? 'fixture';
    if (mode !== 'fixture' && mode !== 'live') throw new PocError('INVALID_MODE', 'Mode must be fixture or live.');
    const config = readConfig();
    if (mode === 'live' && (!config.enableLive || flags['--consent-live'] !== true)) throw new PocError('LIVE_CONSENT_REQUIRED', 'Live evaluation requires ENABLE_LIVE=true and --consent-live.');
    const source = await readFile(inputPath, 'utf8');
    const extension = extname(inputPath).toLowerCase();
    if (!['.csv', '.json'].includes(extension)) throw new PocError('INVALID_FORMAT', 'Input filename must end in .csv or .json.');
    const cases = parseDataset(source, extension === '.csv' ? 'csv' : 'json');
    const provider = mode === 'fixture' ? await loadFixtures() : await liveProvider(config);
    const report = await runExperiment(cases, provider, {
      ...(typeof flags['--strategies'] === 'string' ? { strategies: flags['--strategies'].split(',') } : {}),
      ...(flags['--top'] !== undefined ? { top: Number(flags['--top']) } : {}),
      ...(flags['--concurrency'] !== undefined ? { concurrency: Number(flags['--concurrency']) } : {})
    });
    const output = exportReport(report, flags['--include-addresses'] === true);
    const directory = resolve(join(String(flags['--out'] ?? 'results'), report.runId));
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(join(directory, 'report.json'), JSON.stringify(output, null, 2), { flag: 'wx' }),
      writeFile(join(directory, 'results.csv'), resultsCsv(output), { flag: 'wx' }),
      writeFile(join(directory, 'index.html'), renderHtmlReport(output), { flag: 'wx' }),
      writeFile(join(directory, 'findings.md'), renderMarkdownReport(output), { flag: 'wx' })
    ]);
    console.info(`${report.provenance.evidence}\n${report.provenance.caseCount} cases / ${report.overall.total} trials / ${report.overall.errors} request errors\n${output.summaryOnly ? 'Aggregate-only' : 'SENSITIVE detailed'} report: ${directory}`);
    if (report.overall.errors > 0) process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Evaluation failed.');
  process.exitCode = 1;
}
