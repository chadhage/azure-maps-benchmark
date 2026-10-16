import { setTimeout as delay } from 'node:timers/promises';
import { PocError, isObject } from '../public/modules/errors.js';
import { coordinates } from '../public/modules/dataset.js';

/** @typedef {import('../public/modules/contracts.js').AddressCase} AddressCase */
/** @typedef {import('../public/modules/contracts.js').SearchOptions} SearchOptions */
/** @typedef {import('../public/modules/contracts.js').Candidate} Candidate */
/** @typedef {import('../public/modules/contracts.js').Provider} Provider */

export const API_VERSION = '2026-01-01';
const ENDPOINTS = Object.freeze({ global: 'https://atlas.microsoft.com', us: 'https://us.atlas.microsoft.com', eu: 'https://eu.atlas.microsoft.com' });

/** @param {AddressCase} row @param {SearchOptions} options @param {string} [geography] */
export function buildMapsUrl(row, options, geography = 'global') {
  if (!Object.hasOwn(ENDPOINTS, geography)) throw new PocError('INVALID_GEOGRAPHY', 'Maps geography must be global, us, or eu.');
  if (options.strategy !== 'geocode' && options.strategy !== 'autocomplete') throw new PocError('INVALID_STRATEGY', 'Unknown Maps strategy.');
  const endpoint = ENDPOINTS[/** @type {keyof typeof ENDPOINTS} */ (geography)];
  const url = new URL(options.strategy === 'geocode' ? '/geocode' : '/geocode:autocomplete', endpoint);
  url.searchParams.set('api-version', API_VERSION);
  url.searchParams.set('query', row.query);
  url.searchParams.set('top', String(options.top));
  if (row.coordinates) url.searchParams.set('coordinates', row.coordinates.join(','));
  if (options.strategy === 'autocomplete') {
    if (!row.coordinates) url.searchParams.set('bbox', '-180,-90,180,90');
    if (row.countryRegion) url.searchParams.set('countryRegion', row.countryRegion);
    url.searchParams.set('resultTypeGroups', 'Address');
  }
  return url;
}

/** @param {string} message @returns {never} */
function badResponse(message) {
  throw new PocError('INVALID_RESPONSE', `Azure Maps response ${message}`, 502);
}

/** @param {unknown} value @returns {string|undefined} */
function optionalText(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') badResponse('contains a non-text address or diagnostic field.');
  return value;
}

/** @param {unknown} value @returns {[number,number]|null} */
function point(value) {
  if (value === undefined || value === null) return null;
  if (!isObject(value) || value.type !== 'Point') badResponse('has an invalid feature geometry.');
  try { return coordinates(value.coordinates, 'response feature'); }
  catch (error) {
    if (!(error instanceof PocError)) throw error;
    badResponse('contains invalid coordinates.');
  }
}

/** @param {unknown} payload @returns {Candidate[]} */
export function normalizeResponse(payload) {
  if (!isObject(payload) || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) || payload.features.length > 20) badResponse('must be a GeoJSON FeatureCollection with up to 20 features.');
  return payload.features.map((feature, index) => {
    if (!isObject(feature) || feature.type !== 'Feature' || !isObject(feature.properties)) badResponse('contains an invalid feature.');
    const properties = feature.properties;
    if (properties.address !== undefined && !isObject(properties.address)) badResponse('contains an invalid address.');
    const address = isObject(properties.address) ? properties.address : {};
    if (address.countryRegion !== undefined && !isObject(address.countryRegion)) badResponse('contains an invalid countryRegion.');
    if (address.adminDistricts !== undefined && !Array.isArray(address.adminDistricts)) badResponse('contains invalid adminDistricts.');
    const firstDistrict = Array.isArray(address.adminDistricts) ? address.adminDistricts[0] : undefined;
    const countryRegion = isObject(address.countryRegion) ? optionalText(address.countryRegion.ISO) : undefined;
    /** @type {import('../public/modules/contracts.js').Address} */
    const normalized = {};
    for (const key of ['addressLine', 'locality', 'postalCode']) {
      const value = optionalText(address[key]);
      if (value !== undefined) normalized[/** @type {'addressLine'|'locality'|'postalCode'} */ (key)] = value;
    }
    if (countryRegion !== undefined) normalized.countryRegion = countryRegion;
    if (isObject(firstDistrict)) normalized.adminDistrict = optionalText(firstDistrict.shortName) ?? optionalText(firstDistrict.name);
    const position = point(feature.geometry);
    if (properties.geocodePoints !== undefined && !Array.isArray(properties.geocodePoints)) badResponse('contains invalid geocodePoints.');
    const points = Array.isArray(properties.geocodePoints) ? properties.geocodePoints : [];
    const display = points.find(value => isObject(value) && Array.isArray(value.usageTypes) && value.usageTypes.includes('Display'));
    const displayPosition = isObject(display) ? point(display.geometry) : null;
    const method = isObject(display) ? optionalText(display.calculationMethod) : undefined;
    if (properties.matchCodes !== undefined && (!Array.isArray(properties.matchCodes) || properties.matchCodes.some(code => typeof code !== 'string'))) badResponse('contains invalid matchCodes.');
    return {
      rank: index + 1, address: normalized,
      formattedAddress: optionalText(address.formattedAddress) ?? '',
      position: displayPosition ?? position,
      confidence: optionalText(properties.confidence) ?? null,
      matchCodes: Array.isArray(properties.matchCodes) ? properties.matchCodes : [],
      entityType: optionalText(properties.type) ?? null,
      calculationMethod: method ?? null
    };
  });
}

/**
 * @param {{clientId:string,geography?:string,getToken:(signal?:AbortSignal)=>Promise<string>,fetchImpl?:typeof fetch,sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>,random?:()=>number,timeoutMs?:number}} config
 * @returns {Provider}
 */
export function createAzureProvider(config) {
  if (!config.clientId.trim()) throw new PocError('MISSING_MAPS_CLIENT_ID', 'AZURE_MAPS_CLIENT_ID is required for live mode.');
  const geography = config.geography ?? 'global';
  if (!Object.hasOwn(ENDPOINTS, geography)) throw new PocError('INVALID_GEOGRAPHY', 'Maps geography must be global, us, or eu.');
  const fetchImpl = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? (async (ms, signal) => { await delay(ms, undefined, { signal }); });
  const random = config.random ?? Math.random;
  return {
    mode: 'live', apiVersion: API_VERSION, geography,
    async search(row, options) {
      const url = buildMapsUrl(row, options, geography);
      let retryDelayMs = 0;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (options.signal?.aborted) throw new PocError('CANCELLED', 'Evaluation was cancelled.', 499, attempt - 1, retryDelayMs);
        const timeout = AbortSignal.timeout(config.timeoutMs ?? 10000);
        const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
        let token;
        try { token = await config.getToken(signal); }
        catch (error) {
          if (!(error instanceof Error)) throw error;
          throw new PocError('TOKEN_UNAVAILABLE', 'Microsoft Entra token unavailable. Check Azure login or managed identity and Maps RBAC.', 503, attempt - 1, retryDelayMs);
        }
        if (!token) throw new PocError('TOKEN_UNAVAILABLE', 'Microsoft Entra returned no access token.', 503, attempt - 1, retryDelayMs);
        /** @type {Response|undefined} */
        let response;
        /** @type {PocError|undefined} */
        let failure;
        try {
          response = await fetchImpl(url, { signal, headers: { Authorization: `Bearer ${token}`, 'x-ms-client-id': config.clientId, Accept: 'application/geo+json' } });
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          if (options.signal?.aborted) throw new PocError('CANCELLED', 'Evaluation was cancelled.', 499, attempt, retryDelayMs);
          failure = new PocError(timeout.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', timeout.aborted ? 'Azure Maps request timed out.' : 'Azure Maps network request failed.', 502, attempt, retryDelayMs);
        }
        if (response?.ok) {
          let payload;
          try { payload = await response.json(); }
          catch (error) {
            if (!(error instanceof Error)) throw error;
            throw new PocError('INVALID_RESPONSE', 'Azure Maps response body was not valid JSON or could not be read.', 502, attempt, retryDelayMs);
          }
          try { return { candidates: normalizeResponse(payload).slice(0, options.top), attempts: attempt, retryDelayMs }; }
          catch (error) {
            if (!(error instanceof PocError)) throw error;
            error.attempts = attempt;
            error.retryDelayMs = retryDelayMs;
            throw error;
          }
        }
        if (response) {
          failure = new PocError(`HTTP_${response.status}`, `Azure Maps returned HTTP ${response.status}. Check service status, permissions, and request context.`, 502, attempt, retryDelayMs);
          await response.body?.cancel();
          if (response.status !== 429 && response.status < 500) throw failure;
        }
        if (!failure) throw new Error('Provider request ended without a response or error.');
        if (attempt === 3) throw failure;
        const retryHeader = response?.headers.get('retry-after');
        let wait = 250 * 2 ** (attempt - 1) + Math.floor(random() * 200);
        if (retryHeader) {
          const seconds = Number(retryHeader);
          const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryHeader) - Date.now();
          if (Number.isFinite(parsed)) wait = Math.max(wait, parsed);
        }
        const retryMs = response?.headers.get('x-ms-retry-after-ms');
        if (retryMs && Number.isFinite(Number(retryMs))) wait = Math.max(wait, Number(retryMs));
        if (retryDelayMs + wait > 30000) throw new PocError('RETRY_BUDGET_EXCEEDED', 'Azure Maps requested a retry delay beyond the 30-second budget. Retry this case later.', 503, attempt, retryDelayMs);
        await sleep(wait, options.signal);
        retryDelayMs += wait;
      }
      throw new Error('Unreachable retry state.');
    }
  };
}

/** @param {unknown} input @returns {Provider} */
export function createFixtureProvider(input) {
  if (!Array.isArray(input)) throw new PocError('INVALID_FIXTURE', 'Fixture data must be an array.');
  const fixtures = input.map(value => {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.query !== 'string' || !['geocode', 'autocomplete'].includes(String(value.strategy))) throw new PocError('INVALID_FIXTURE', 'Fixture entries require id, query, and strategy.');
    const candidates = normalizeResponse(value.response);
    return { id: value.id, query: value.query, strategy: value.strategy, candidates };
  });
  return {
    mode: 'fixture', apiVersion: API_VERSION, geography: 'none',
    async search(row, options) {
      const fixture = fixtures.find(value => value.id === row.id && value.query === row.query && value.strategy === options.strategy);
      if (!fixture) throw new PocError('FIXTURE_NOT_FOUND', 'No exact fixture exists for this case, query, and strategy. Use the unchanged sample or explicitly enable live mode.', 422);
      return { candidates: structuredClone(fixture.candidates.slice(0, options.top)), attempts: 0, retryDelayMs: 0 };
    }
  };
}
