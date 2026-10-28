const test = require('node:test');
const assert = require('node:assert/strict');
const CATALOG = require('../api/_lib/catalog');
const { validateCatalog } = require('../scripts/validate-store-items');

test('current store catalog is valid', () => {
  assert.deepStrictEqual(validateCatalog(CATALOG), []);
});

test('validates required fields, supported options, and safe deliverables', () => {
  const catalog = {
    'test-item': {
      name: 'Test item',
      priceEnv: 'PRICE_TEST_ITEM',
      kind: 'subscription',
      retired: true,
      category: 'utilities',
      blurb: 'A test item',
      version: '1.2.3',
      appUrl: 'https://example.com/app',
      fileKey: 'test-item/test.zip',
      filename: 'test.zip',
      sha256: 'a'.repeat(64),
    },
  };
  assert.deepStrictEqual(validateCatalog(catalog), []);
});

test('reports invalid catalog fields and duplicate identifiers', () => {
  const catalog = {
    'Bad Id': {
      name: ' ',
      priceEnv: 'not-valid',
      kind: 'monthly',
      retired: 'yes',
      category: 'other',
      version: '1.2',
      appUrl: 'http://example.com',
      fileKey: '../shared/file.zip',
      filename: 'different.zip',
      sha256: 'bad',
    },
    valid: { name: 'Another', priceEnv: 'not-valid' },
  };

  const errors = validateCatalog(catalog);
  for (const field of ['id', 'name', 'priceEnv', 'kind', 'retired', 'category', 'version', 'appUrl', 'fileKey', 'filename', 'sha256']) {
    assert.ok(errors.some((error) => error.startsWith(`Bad Id.${field}:`)), `${field} error missing`);
  }
  assert.ok(errors.some((error) => error.startsWith('valid.priceEnv:')));
});

test('rejects non-object catalogs and non-object product values', () => {
  assert.deepStrictEqual(validateCatalog([]), ['catalog must be an object']);
  assert.ok(validateCatalog({ broken: null }).includes('broken: must be an object'));
});

test('rejects duplicate price variables and deliverable object keys', () => {
  const product = {
    name: 'Test item',
    priceEnv: 'PRICE_TEST_ITEM',
    fileKey: 'test-item/test.zip',
    filename: 'test.zip',
    sha256: 'a'.repeat(64),
  };
  const errors = validateCatalog({
    first: product,
    second: { ...product, name: 'Another item' },
  });
  assert.ok(errors.some((error) => error.startsWith('second.priceEnv: duplicates')));
  assert.ok(errors.some((error) => error.startsWith('second.fileKey: duplicates')));
});

test('reports invalid object keys without throwing', () => {
  const errors = validateCatalog({
    broken: {
      name: 'Broken item',
      priceEnv: 'PRICE_BROKEN',
      fileKey: 123,
      filename: 'file.zip',
      sha256: 'a'.repeat(64),
    },
  });
  assert.ok(errors.some((error) => error.startsWith('broken.fileKey:')));
});
