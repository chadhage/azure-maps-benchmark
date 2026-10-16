import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDataset, validateDataset, validateOptions } from '../../public/modules/dataset.js';
import { addressCase } from '../helpers.js';

test('JSON arrays and versioned envelopes share one validated contract', () => {
  const cases = [addressCase(), addressCase({ id: 'unlabelled', expected: undefined })];
  assert.equal(parseDataset(JSON.stringify(cases)).length, 2);
  assert.equal(parseDataset(JSON.stringify({ schemaVersion: '1.0', cases }))[0].id, 'case-1');
});

test('CSV preserves BOM, Unicode, quoted commas, escaped quotes and newlines', () => {
  const csv = '\uFEFFid,query,category,expectedAddressLine,expectedLocality,truthSource\r\nx,"100 ""Example"", St\nTestville",typo,100 Example St,Testville,Independent oracle\r\n';
  const [row] = parseDataset(csv, 'csv');
  assert.equal(row.query, '100 "Example", St\nTestville');
  assert.equal(row.expected.source, 'Independent oracle');
  assert.equal(parseDataset('id,query,category\njp,Tokyo,international\n', 'csv')[0].expected, undefined);
});

test('CSV coordinates and negative controls are explicit', () => {
  const csv = 'id,query,category,expectedLongitude,expectedLatitude,toleranceMeters,truthSource,expectedNoMatch\np,Partial,partial,0,0,50,Survey,\nn,Not a place,negative,,,,Human,true\n';
  const rows = parseDataset(csv, 'csv');
  assert.deepEqual(rows[0].expected.position, [0, 0]);
  assert.equal(rows[1].expected.noMatch, true);
});

test('invalid CSV is rejected rather than silently repaired', () => {
  for (const csv of [
    'id,query\nx,"unterminated',
    'id,query\nx,a,b',
    'id,id,query\nx,y,z',
    'id,query,unknown\nx,y,z',
    'id,query\nx,a"b',
    'id,query\nx,"a"z'
  ]) assert.throws(() => parseDataset(csv, 'csv'), /CSV|column|header/i);
});

test('invalid input, duplicate IDs, unknown fields and weak or conflicting truth fail validation', () => {
  for (const value of [
    [], {}, null, [addressCase({ query: ' ' })],
    [addressCase(), addressCase()],
    [addressCase({ secret: 'unexpected' })],
    [addressCase({ coordinates: [181, 0] })],
    [addressCase({ countryRegion: 'USA' })],
    [addressCase({ expected: { source: 'x', position: [0, 91] } })],
    [addressCase({ expected: { source: 'x', position: [0, 0], toleranceMeters: 0 } })],
    [addressCase({ expected: { address: { locality: 'x' } } })],
    [addressCase({ expected: { source: 'x', address: {} } })],
    [addressCase({ expected: { source: 'x', noMatch: true, address: { locality: 'x' } } })],
    [addressCase({ expected: { source: 'x', position: [0, 0] } })],
    [addressCase({ expected: { source: 'x', address: { madeUp: 'x' } } })]
  ]) assert.throws(() => validateDataset(value), /dataset|case|query|id|coordinate|country|expected|truth|field|tolerance/i);
});

test('dataset size and query length caps apply before any paid request', () => {
  assert.throws(() => validateDataset(Array.from({ length: 201 }, (_, i) => addressCase({ id: String(i) }))), /200/);
  assert.throws(() => validateDataset([addressCase({ query: 'x'.repeat(501) })]), /500/);
});

test('options are bounded, explicit and reject unknown or duplicate strategies', () => {
  assert.deepEqual(validateOptions({}), { strategies: ['geocode', 'autocomplete'], top: 5, concurrency: 2 });
  for (const options of [
    { top: 21 }, { concurrency: 0 }, { concurrency: 1.5 },
    { strategies: [] }, { strategies: ['geocode', 'geocode'] },
    { strategies: ['fuzzy'] }, { hidden: true }, { top: '5' }
  ]) assert.throws(() => validateOptions(options), /option|top|concurrency|strateg/i);
});
