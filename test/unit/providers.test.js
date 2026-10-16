import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapsUrl, normalizeResponse, createAzureProvider, createFixtureProvider, API_VERSION } from '../../src/providers.js';
import { addressCase, feature } from '../helpers.js';

const request = { strategy: 'geocode', top: 5 };
const response = () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [feature()] }), { status: 200 });

test('current geocode requests never mix free-form query with structured-only countryRegion', () => {
  const url = buildMapsUrl(addressCase({ countryRegion: 'US' }), request);
  assert.equal(url.searchParams.get('api-version'), '2026-01-01');
  assert.equal(API_VERSION, '2026-01-01');
  assert.equal(url.searchParams.get('query'), '100 Example St, Testville');
  assert.equal(url.searchParams.has('countryRegion'), false);
  assert.equal(url.searchParams.has('subscription-key'), false);
});

test('autocomplete has explicit spatial context and never borrows expected coordinates', () => {
  const row = addressCase({ countryRegion: 'US', expected: { source: 'survey', position: [1, 2], toleranceMeters: 50 } });
  const global = buildMapsUrl(row, { strategy: 'autocomplete', top: 3 });
  assert.equal(global.pathname, '/geocode:autocomplete');
  assert.equal(global.searchParams.get('bbox'), '-180,-90,180,90');
  assert.equal(global.searchParams.has('coordinates'), false);
  assert.equal(global.searchParams.get('countryRegion'), 'US');
  assert.equal(global.searchParams.get('resultTypeGroups'), 'Address');
  const biased = buildMapsUrl({ ...row, coordinates: [3, 4] }, { strategy: 'autocomplete', top: 5 }, 'eu');
  assert.equal(biased.hostname, 'eu.atlas.microsoft.com');
  assert.equal(biased.searchParams.get('coordinates'), '3,4');
  assert.equal(biased.searchParams.has('bbox'), false);
  assert.throws(() => buildMapsUrl(row, { strategy: 'unknown', top: 5 }), /strategy/);
  assert.throws(() => buildMapsUrl(row, request, 'https://evil.example'), /geography/);
});

test('normalization preserves ranked candidates, ISO country, diagnostics, and Display point', () => {
  const [actual] = normalizeResponse({ type: 'FeatureCollection', features: [feature()] });
  assert.deepEqual(actual.position, [-73.98, 40.75]);
  assert.equal(actual.address.countryRegion, 'US');
  assert.equal(actual.address.adminDistrict, 'NY');
  assert.equal(actual.calculationMethod, 'Rooftop');
  assert.equal(actual.rank, 1);
  assert.deepEqual(normalizeResponse({ type: 'FeatureCollection', features: [] }), []);
});

test('malformed provider payloads fail explicitly, not as no matches', () => {
  for (const payload of [{}, { features: [] }, { type: 'FeatureCollection', features: 'wrong' },
    { type: 'FeatureCollection', features: [null] },
    { type: 'FeatureCollection', features: [feature({ geometry: { type: 'Point', coordinates: [999, 0] } })] }
  ]) assert.throws(() => normalizeResponse(payload), /response|coordinate|feature/i);
});

test('sparse but valid features do not invent country codes or confidence', () => {
  const [actual] = normalizeResponse({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { address: { countryRegion: { name: 'Japan' } } } }
  ] });
  assert.equal(actual.address.countryRegion, undefined);
  assert.equal(actual.confidence, null);
  assert.equal(actual.calculationMethod, null);
});

test('live provider uses Entra token headers and respects Retry-After', async () => {
  const calls = [];
  const waits = [];
  const provider = createAzureProvider({
    clientId: 'maps-account-id',
    getToken: async () => 'test-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } }) : response();
    },
    sleep: async ms => { waits.push(ms); },
    random: () => 0
  });
  const actual = await provider.search(addressCase(), request);
  assert.equal(actual.attempts, 2);
  assert.equal(actual.candidates.length, 1);
  assert.deepEqual(waits, [2000]);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].init.headers['x-ms-client-id'], 'maps-account-id');
});

test('401/403 are not retried and cannot leak upstream request data', async () => {
  let count = 0;
  const provider = createAzureProvider({
    clientId: 'id', getToken: async () => 'secret',
    fetchImpl: async () => { count++; return new Response('secret address', { status: 403 }); }
  });
  await assert.rejects(provider.search(addressCase(), request), error => {
    assert.equal(error.code, 'HTTP_403');
    assert.equal(error.attempts, 1);
    assert.equal(error.message.includes('secret'), false);
    return true;
  });
  assert.equal(count, 1);
});

test('timeouts, network errors and server errors are bounded and never become empty successes', async () => {
  let attempts = 0;
  const provider = createAzureProvider({
    clientId: 'id', getToken: async () => 'token',
    fetchImpl: async () => { attempts++; throw new TypeError('network failed'); },
    sleep: async () => {}, random: () => 0
  });
  await assert.rejects(provider.search(addressCase(), request), error => error.code === 'NETWORK_ERROR' && error.attempts === 3);
  assert.equal(attempts, 3);
  const invalid = createAzureProvider({ clientId: 'id', getToken: async () => 't', fetchImpl: async () => new Response('bad json') });
  await assert.rejects(invalid.search(addressCase(), request), /response/i);
});

test('excessive Retry-After is surfaced without retrying earlier than requested', async () => {
  const provider = createAzureProvider({
    clientId: 'id', getToken: async () => 't',
    fetchImpl: async () => new Response('', { status: 429, headers: { 'Retry-After': '999' } }),
    sleep: async () => { assert.fail('must not sleep or retry'); }
  });
  await assert.rejects(provider.search(addressCase(), request), error => error.code === 'RETRY_BUDGET_EXCEEDED');
});

test('fixture mode is deterministic and never guesses results for unseen inputs', async () => {
  const row = addressCase();
  const fixtures = [{ id: row.id, query: row.query, strategy: 'geocode', response: { type: 'FeatureCollection', features: [feature()] } }];
  const provider = createFixtureProvider(fixtures);
  assert.equal((await provider.search(row, request)).attempts, 0);
  await assert.rejects(provider.search({ ...row, query: 'changed' }, request), /fixture/i);
  await assert.rejects(provider.search(row, { ...request, strategy: 'autocomplete' }), /fixture/i);
});
