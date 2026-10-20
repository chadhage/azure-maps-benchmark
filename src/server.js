import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readConfig } from './config.js';
import { loadFixtures, liveProvider } from './runtime.js';
import { runExperiment } from './experiment.js';
import { PocError, isObject } from '../public/modules/errors.js';
import { MAX_CASES } from '../public/modules/dataset.js';
import { createAttemptBudget } from './attempt-budget.js';

/** @type {Map<string,[string,string]>} */
const FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
for (const name of ['contracts', 'dataset', 'evaluation', 'errors', 'reports', 'theme']) {
  FILES.set(`/modules/${name}.js`, [`modules/${name}.js`, 'text/javascript; charset=utf-8']);
}
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'
};

/** @param {http.ServerResponse} res @param {number} status @param {unknown} body */
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** @param {http.IncomingMessage} req */
async function readBody(req) {
  if (Number(req.headers['content-length'] ?? 0) > 1048576) {
    req.resume();
    throw new PocError('BODY_TOO_LARGE', 'Request exceeds the 1 MiB limit.', 413);
  }
  const content = await new Promise((resolve, reject) => {
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    function cleanup() {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
    }
    /** @param {Buffer} chunk */
    function onData(chunk) {
      size += chunk.length;
      if (size > 1048576) {
        cleanup();
        req.resume();
        reject(new PocError('BODY_TOO_LARGE', 'Request exceeds the 1 MiB limit.', 413));
      } else chunks.push(chunk);
    }
    function onEnd() { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); }
    /** @param {Error} error */
    function onError(error) { cleanup(); reject(error); }
    function onAborted() { cleanup(); reject(new PocError('CANCELLED', 'Request body was interrupted.', 499)); }
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });
  try { return JSON.parse(content); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new PocError('INVALID_JSON', 'Request body must be valid JSON.');
  }
}

/**
 * @param {{config?:import('./config.js').Config,fixtureProvider?:import('../public/modules/contracts.js').Provider,liveProvider?:import('../public/modules/contracts.js').Provider}} [dependencies]
 */
export async function createApp(dependencies = {}) {
  const config = dependencies.config ?? readConfig();
  const fixtureProvider = dependencies.fixtureProvider ?? await loadFixtures();
  let active = false;
  let live = dependencies.liveProvider;
  const attemptBudget = config.attemptLimit > 0 ? await createAttemptBudget(config.attemptLimit, config.attemptLedgerPath) : null;
  const server = http.createServer((req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    async function handle() {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/healthz') return json(res, 200, { status: 'ok', service: 'azure-maps-poc', mapsConnectivity: 'not-checked' });
      const host = req.headers.host ?? '';
      let hostname;
      try { hostname = new URL(`http://${host}`).hostname; }
      catch (_error) { throw new PocError('INVALID_HOST', 'Invalid host header.', 400); }
      const allowedHosts = config.platformHosted ? [config.hostname] : ['127.0.0.1', 'localhost', '[::1]'];
      if (!allowedHosts.includes(hostname)) throw new PocError('INVALID_HOST', 'Host is not allowed.', 403);
      if (path !== '/healthz' && config.requirePlatformAuth && !req.headers['x-ms-client-principal-id']) throw new PocError('AUTHENTICATION_REQUIRED', 'Sign in through the App Service authentication endpoint.', 401);
      if (req.method === 'GET' && path === '/api/config') return json(res, 200, { liveEnabled: config.enableLive, attemptBudget: attemptBudget?.snapshot() ?? null, maxCases: MAX_CASES, maxBytes: 1048576, maxAttempts: 3, apiVersion: '2026-01-01', geography: config.geography });
      if (req.method === 'GET' && path === '/api/sample') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(await readFile(new URL('../data/sample-addresses.json', import.meta.url)));
      }
      if (req.method === 'POST' && path === '/api/run') {
        const expectedOrigin = `${config.platformHosted ? 'https' : 'http'}://${host}`;
        if (req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site') throw new PocError('INVALID_ORIGIN', 'Only same-origin browser requests are accepted.', 403);
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new PocError('INVALID_CONTENT_TYPE', 'Use application/json.', 415);
        const body = await readBody(req);
        if (!isObject(body) || Object.keys(body).some(key => !['mode', 'dataset', 'options', 'liveConsent'].includes(key))) throw new PocError('INVALID_REQUEST', 'Request requires mode, dataset, options, and optional liveConsent.');
        if (body.mode !== 'fixture' && body.mode !== 'live') throw new PocError('INVALID_MODE', 'Mode must be fixture or live.');
        if (body.mode === 'live' && !config.enableLive) throw new PocError('LIVE_DISABLED', 'Live requests are disabled on this server.', 403);
        if (body.mode === 'live' && body.liveConsent !== true) throw new PocError('LIVE_CONSENT_REQUIRED', 'Explicit consent is required before addresses are submitted to Azure Maps.', 403);
        if (active) throw new PocError('RUN_IN_PROGRESS', 'Another evaluation is running. Try again after it finishes.', 409);
        active = true;
        const abort = new AbortController();
        res.once('close', () => { if (!res.writableEnded) abort.abort(); });
        try {
          if (body.mode === 'live' && !live) live = await liveProvider(config, attemptBudget?.reserve);
          const provider = body.mode === 'live' ? live : fixtureProvider;
          if (!provider) throw new Error('Live provider was not initialized.');
          const report = await runExperiment(body.dataset, provider, body.options, AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]));
          if (!res.destroyed) json(res, 200, report);
          console.info(JSON.stringify({ event: 'evaluation_finished', requestId, mode: body.mode, cases: report.provenance.caseCount, trials: report.overall.total, errors: report.overall.errors }));
        } finally { active = false; }
        return;
      }
      const asset = FILES.get(path);
      if ((req.method === 'GET' || req.method === 'HEAD') && asset) {
        const [file, type] = asset;
        const content = await readFile(new URL(`../public/${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': type });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      throw new PocError('NOT_FOUND', 'Resource not found.', 404);
    }
    handle().catch(error => {
      const known = error instanceof PocError;
      const code = known ? error.code : 'INTERNAL_ERROR';
      const status = known ? error.status : 500;
      console.error(JSON.stringify({ event: 'request_failed', requestId, code, status }));
      if (!res.destroyed && !res.headersSent) json(res, status, { error: { code, message: known ? error.message : 'Unexpected server error. See the server event and request ID.', requestId } });
      else if (!res.destroyed) res.destroy();
    });
  });
  server.requestTimeout = 130000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = readConfig();
    const server = await createApp({ config });
    server.on('error', error => { console.error(`Server failed: ${error.message}`); process.exitCode = 1; });
    server.listen(config.port, config.host, () => console.info(`Azure Maps POC: http://${config.host}:${config.port} (live ${config.enableLive ? 'enabled; consent required' : 'disabled'})`));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Server startup failed.');
    process.exitCode = 1;
  }
}
