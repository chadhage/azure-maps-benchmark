import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/server.js';
import { readConfig } from '../../src/config.js';

async function start(t, overrides = {}) {
  const app = await createApp({ config: { ...readConfig({ PORT: '0' }), ...overrides } });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((resolve, reject) => { app.close(error => error ? reject(error) : resolve()); app.closeAllConnections(); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { base, post: body => fetch(`${base}/api/run`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) };
}

test('configuration fails closed on unsafe bindings and incomplete live setup', () => {
  assert.equal(readConfig({}).enableLive, false);
  for (const env of [
    { PORT: '-1' }, { ENABLE_LIVE: 'yes' }, { ENABLE_LIVE: 'true' },
    { HOST: '0.0.0.0' }, { REQUIRE_PLATFORM_AUTH: 'true' },
    { LIVE_HTTP_ATTEMPT_LIMIT: '-1' }, { LIVE_HTTP_ATTEMPT_LIMIT: '1.5' }, { LIVE_HTTP_ATTEMPT_LIMIT: '30' },
    { AZURE_MAPS_GEOGRAPHY: 'untrusted' }
  ]) assert.throws(() => readConfig(env), /PORT|true|CLIENT_ID|authentication|binding|GEOGRAPHY|ATTEMPT/);
});

test('health is explicit about not verifying Maps connectivity', async t => {
  const { base } = await start(t);
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mapsConnectivity, 'not-checked');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  assert.equal((await (await fetch(`${base}/api/config`)).json()).liveEnabled, false);
});

test('sample produces exact mixed-label metrics without any Azure credentials', async t => {
  const { post } = await start(t);
  const dataset = JSON.parse(await readFile(new URL('../../data/sample-addresses.json', import.meta.url), 'utf8'));
  const response = await post({ mode: 'fixture', dataset });
  assert.equal(response.status, 200);
  const run = await response.json();
  assert.equal(run.results.length, 16);
  assert.equal(run.overall.labelled, 12);
  assert.equal(run.overall.top1Accuracy, 0.5);
  assert.equal(run.overall.topKAccuracy, 2 / 3);
  assert.equal(run.overall.coverage, 11 / 16);
  assert.equal(run.overall.httpAttempts, 0);
});

test('live requests require server opt-in AND explicit consent', async t => {
  const offline = await start(t);
  assert.equal((await offline.post({ mode: 'live', dataset: [] })).status, 403);
  const configured = await start(t, { enableLive: true, clientId: 'test' });
  const response = await configured.post({ mode: 'live', dataset: [] });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'LIVE_CONSENT_REQUIRED');
});

test('malformed datasets, request shapes, origins and content types fail explicitly', async t => {
  const { base, post } = await start(t);
  assert.equal((await post({ mode: 'fixture', dataset: [] })).status, 400);
  assert.equal((await post({ mode: 'anything', dataset: [] })).status, 400);
  assert.equal((await post({ mode: 'fixture', dataset: [], secret: 'x' })).status, 400);
  assert.equal((await fetch(`${base}/api/run`, { method: 'POST', headers: { Origin: 'http://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/api/run`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(`${base}/api/run`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
});

test('only the public asset allowlist is served, with no reflected address data', async t => {
  const { base } = await start(t);
  assert.equal((await fetch(`${base}/`)).status, 200);
  for (const path of ['/.env', '/data/private/input.json', '/src/config.js', '/fixtures/responses.json', '/modules/unknown.js']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
  assert.equal((await fetch(`${base}/modules/dataset.js`)).status, 200);
});

test('oversized bodies return an explicit limit error before any evaluation', async t => {
  const { base } = await start(t);
  const response = await fetch(`${base}/api/run`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'x'.repeat(1048577) }) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'BODY_TOO_LARGE');
});

test('App Service requests require the platform principal except for health', async t => {
  const { base } = await start(t, { platformHosted: true, requirePlatformAuth: true, hostname: '127.0.0.1' });
  assert.equal((await fetch(`${base}/api/config`)).status, 401);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/config`, { headers: { 'x-ms-client-principal-id': 'test-principal' } })).status, 200);
});

test('public hosted configuration is explicit and requires a persistent cap for live access', () => {
  const hosted = { HOST: '0.0.0.0', WEBSITE_INSTANCE_ID: 'test-instance', WEBSITE_HOSTNAME: 'demo.azurewebsites.net', HOME: '/home', PUBLIC_DEMO: 'true' };
  assert.equal(readConfig({ ...hosted }).publicDemo, true);
  assert.equal(readConfig({ ...hosted }).requirePlatformAuth, false);
  assert.throws(() => readConfig({ ...hosted, REQUIRE_PLATFORM_AUTH: 'true' }), /PUBLIC_DEMO/);
  assert.throws(() => readConfig({ PUBLIC_DEMO: 'true' }), /PUBLIC_DEMO/);
  assert.throws(() => readConfig({ ...hosted, ENABLE_LIVE: 'true', AZURE_MAPS_CLIENT_ID: 'test' }), /positive persistent/);
  assert.throws(() => readConfig({ ...hosted, HOME: '', LIVE_HTTP_ATTEMPT_LIMIT: '30' }), /persistent/);
  const config = readConfig({ ...hosted, ENABLE_LIVE: 'true', AZURE_MAPS_CLIENT_ID: 'test', LIVE_HTTP_ATTEMPT_LIMIT: '30' });
  assert.equal(config.attemptLimit, 30);
  assert.match(config.attemptLedgerPath, /maps-demo-attempts\.log$/);
});

test('public hosted requests need no principal but retain consent, origin and private-file controls', async t => {
  const { base } = await start(t, { platformHosted: true, publicDemo: true, requirePlatformAuth: false, hostname: '127.0.0.1', enableLive: true });
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/api/config`)).status, 200);
  assert.equal((await fetch(`${base}/data/private/input.json`)).status, 404);
  const dataset = await (await fetch(`${base}/api/sample`)).json();
  const post = (body, origin = base.replace('http:', 'https:'), site = 'same-origin') => fetch(`${base}/api/run`, {
    method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': site, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const fixture = await post({ mode: 'fixture', dataset });
  assert.equal(fixture.status, 200);
  assert.equal((await fixture.json()).overall.httpAttempts, 0);
  const noConsent = await post({ mode: 'live', dataset });
  assert.equal(noConsent.status, 403);
  assert.equal((await noConsent.json()).error.code, 'LIVE_CONSENT_REQUIRED');
  assert.equal((await post({ mode: 'fixture', dataset }, 'https://other.example')).status, 403);
  assert.equal((await post({ mode: 'fixture', dataset }, base.replace('http:', 'https:'), 'cross-site')).status, 403);
});

test('platform health probes may use an internal host without weakening API host checks', async t => {
  const { base } = await start(t, { platformHosted: true, requirePlatformAuth: true, hostname: 'approved.azurewebsites.net' });
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/config`)).status, 403);
});
