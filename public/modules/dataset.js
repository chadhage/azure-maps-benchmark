import { isObject, PocError } from './errors.js';

/** @typedef {import('./contracts.js').AddressCase} AddressCase */
/** @typedef {import('./contracts.js').Address} Address */
/** @typedef {import('./contracts.js').Expected} Expected */
/** @typedef {import('./contracts.js').RunOptions} RunOptions */

export const MAX_CASES = 200;
export const ADDRESS_FIELDS = /** @type {const} */ (['addressLine', 'locality', 'adminDistrict', 'postalCode', 'countryRegion']);
const CASE_FIELDS = ['id', 'query', 'category', 'countryRegion', 'coordinates', 'expected'];
export const CSV_HEADERS = [
  'id', 'query', 'category', 'countryRegion', 'longitude', 'latitude',
  'expectedAddressLine', 'expectedLocality', 'expectedAdminDistrict',
  'expectedPostalCode', 'expectedCountryRegion', 'expectedLongitude',
  'expectedLatitude', 'toleranceMeters', 'truthSource', 'expectedNoMatch'
];

/** @param {string} message @returns {never} */
function invalid(message) {
  throw new PocError('INVALID_DATASET', message);
}

/** @param {Record<string,unknown>} value @param {readonly string[]} allowed @param {string} label */
function knownFields(value, allowed, label) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid(`${label} contains an unknown field.`);
}

/** @param {unknown} value @param {string} label @param {number} [max] */
function text(value, label, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${label} must be non-empty text, at most ${max} characters.`);
  return value.trim();
}

/** @param {unknown} value @param {string} label @returns {[number,number]} */
export function coordinates(value, label) {
  if (!Array.isArray(value) || value.length !== 2 ||
      typeof value[0] !== 'number' || typeof value[1] !== 'number' ||
      !Number.isFinite(value[0]) || !Number.isFinite(value[1]) ||
      Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
    invalid(`${label} coordinates must be [longitude, latitude] within WGS84 bounds.`);
  }
  return [value[0], value[1]];
}

/** @param {unknown} value @param {string} label */
function country(value, label) {
  const result = text(value, label, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(result)) invalid(`${label} must be a two-letter country/region code.`);
  return result;
}

/** @param {unknown} value @param {string} label @returns {Expected} */
function expected(value, label) {
  if (!isObject(value)) invalid(`${label} expected truth must be an object.`);
  knownFields(value, ['source', 'noMatch', 'address', 'position', 'toleranceMeters'], `${label} expected`);
  const source = text(value.source, `${label} truth source`, 300);
  if (value.noMatch !== undefined && typeof value.noMatch !== 'boolean') invalid(`${label} expected noMatch must be boolean.`);
  if (value.noMatch === true) {
    if (value.address !== undefined || value.position !== undefined || value.toleranceMeters !== undefined) invalid(`${label} expected noMatch cannot also specify a target.`);
    return { source, noMatch: true };
  }
  /** @type {Expected} */
  const result = { source };
  if (value.address !== undefined) {
    if (!isObject(value.address)) invalid(`${label} expected address must be an object.`);
    knownFields(value.address, ADDRESS_FIELDS, `${label} expected address`);
    /** @type {Address} */
    const address = {};
    for (const field of ADDRESS_FIELDS) {
      if (value.address[field] !== undefined) address[field] = field === 'countryRegion'
        ? country(value.address[field], `${label} expected country`)
        : text(value.address[field], `${label} expected ${field}`, 300);
    }
    if (!Object.keys(address).length) invalid(`${label} expected address must contain a comparison field.`);
    result.address = address;
  }
  if (value.position !== undefined) {
    result.position = coordinates(value.position, `${label} expected`);
    if (typeof value.toleranceMeters !== 'number' || !Number.isFinite(value.toleranceMeters) ||
        value.toleranceMeters <= 0 || value.toleranceMeters > 100000) invalid(`${label} expected toleranceMeters must be > 0 and <= 100000.`);
    result.toleranceMeters = value.toleranceMeters;
  } else if (value.toleranceMeters !== undefined) invalid(`${label} expected tolerance requires coordinates.`);
  if (!result.address && !result.position) invalid(`${label} expected truth needs address fields, coordinates, or noMatch.`);
  return result;
}

/** @param {unknown} input @returns {AddressCase[]} */
export function validateDataset(input) {
  let cases = input;
  if (isObject(input)) {
    knownFields(input, ['schemaVersion', 'cases'], 'dataset');
    if (input.schemaVersion !== '1.0') invalid('dataset schemaVersion must be 1.0.');
    cases = input.cases;
  }
  if (!Array.isArray(cases) || !cases.length || cases.length > MAX_CASES) invalid(`dataset must contain 1 to ${MAX_CASES} cases.`);
  const ids = new Set();
  return cases.map((value, index) => {
    const label = `case ${index + 1}`;
    if (!isObject(value)) invalid(`${label} must be an object.`);
    knownFields(value, CASE_FIELDS, label);
    const id = text(value.id, `${label} id`, 100);
    if (ids.has(id)) invalid(`${label} id is duplicated.`);
    ids.add(id);
    /** @type {AddressCase} */
    const result = { id, query: text(value.query, `${label} query`), category: value.category === undefined ? 'uncategorized' : text(value.category, `${label} category`, 100) };
    if (value.countryRegion !== undefined) result.countryRegion = country(value.countryRegion, `${label} country`);
    if (value.coordinates !== undefined) result.coordinates = coordinates(value.coordinates, label);
    if (value.expected !== undefined) result.expected = expected(value.expected, label);
    return result;
  });
}

/** @param {unknown} [input] @returns {RunOptions} */
export function validateOptions(input = {}) {
  if (!isObject(input)) invalid('options must be an object.');
  knownFields(input, ['strategies', 'top', 'concurrency'], 'options');
  const top = input.top ?? 5;
  const concurrency = input.concurrency ?? 2;
  const strategies = input.strategies ?? ['geocode', 'autocomplete'];
  if (typeof top !== 'number' || !Number.isInteger(top) || top < 1 || top > 20) invalid('options top must be an integer from 1 to 20.');
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) invalid('options concurrency must be an integer from 1 to 4.');
  if (!Array.isArray(strategies) || !strategies.length || strategies.length > 2 ||
      strategies.some(value => value !== 'geocode' && value !== 'autocomplete') ||
      new Set(strategies).size !== strategies.length) invalid('options strategies must be unique geocode/autocomplete values.');
  return { top, concurrency, strategies: strategies.map(value => value === 'geocode' ? 'geocode' : 'autocomplete') };
}

/** @param {string} input @returns {string[][]} */
function csvRows(input) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === ',' || ch === '\n') {
      row.push(field); field = ''; closed = false;
      if (ch === '\n') { rows.push(row); row = []; }
    } else if (ch === '"' && field === '' && !closed) quoted = true;
    else if (ch === '"' || closed) invalid('CSV contains invalid quoting.');
    else field += ch;
  }
  if (quoted) invalid('CSV contains an unterminated quoted field.');
  row.push(field);
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows.filter(cells => cells.some(cell => cell.trim() !== ''));
}

/** @param {string} source @returns {unknown[]} */
function parseCsv(source) {
  const [headers, ...rows] = csvRows(source);
  if (!headers || !headers.includes('id') || !headers.includes('query') ||
      new Set(headers).size !== headers.length || headers.some(header => !CSV_HEADERS.includes(header))) invalid('CSV requires unique, known headers including id and query.');
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) invalid(`CSV row ${index + 2} has an incorrect column count.`);
    const fields = Object.fromEntries(headers.map((header, column) => [header, cells[column].trim()]));
    /** @param {string} name */
    const number = name => {
      if (!fields[name] || !Number.isFinite(Number(fields[name]))) invalid(`CSV row ${index + 2} has an invalid numeric column.`);
      return Number(fields[name]);
    };
    /** @type {Record<string,unknown>} */
    const result = { id: fields.id, query: fields.query };
    if (fields.category) result.category = fields.category;
    if (fields.countryRegion) result.countryRegion = fields.countryRegion;
    if (fields.longitude || fields.latitude) result.coordinates = [number('longitude'), number('latitude')];
    const address = Object.fromEntries(ADDRESS_FIELDS.flatMap(key => {
      const column = `expected${key[0].toUpperCase()}${key.slice(1)}`;
      return fields[column] ? [[key, fields[column]]] : [];
    }));
    if (fields.expectedNoMatch && !['true', 'false'].includes(fields.expectedNoMatch)) invalid('CSV expectedNoMatch must be true or false.');
    if (Object.keys(address).length || fields.expectedLongitude || fields.expectedLatitude || fields.expectedNoMatch === 'true' || fields.truthSource || fields.toleranceMeters) {
      result.expected = {
        source: fields.truthSource,
        ...(Object.keys(address).length ? { address } : {}),
        ...(fields.expectedNoMatch === 'true' ? { noMatch: true } : {}),
        ...(fields.expectedLongitude || fields.expectedLatitude ? { position: [number('expectedLongitude'), number('expectedLatitude')] } : {}),
        ...(fields.toleranceMeters ? { toleranceMeters: number('toleranceMeters') } : {})
      };
    }
    return result;
  });
}

/** @param {string} source @returns {AddressCase[]} */
export function parseAddressCsv(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 1048576) invalid('CSV must be at most 1 MiB.');
  const rows = csvRows(source);
  return validateDataset(rows.map((cells, index) => {
    if (cells.length !== 1) invalid(`CSV row ${index + 1} must contain exactly one field. Quote addresses containing commas. Do not include a header.`);
    return { id: `demo-${index + 1}`, query: cells[0], category: 'demo' };
  }));
}

/** @param {string} source @param {'json'|'csv'} [format] @returns {AddressCase[]} */
export function parseDataset(source, format = 'json') {
  if (typeof source !== 'string' || source.length > 1048576) invalid('dataset text must be at most 1 MiB.');
  if (format === 'csv') return validateDataset(parseCsv(source));
  if (format !== 'json') invalid('dataset format must be json or csv.');
  let parsed;
  try { parsed = JSON.parse(source.replace(/^\uFEFF/, '')); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    invalid('dataset JSON is invalid. Check the syntax without submitting data.');
  }
  return validateDataset(parsed);
}
