#!/usr/bin/env node
const CATALOG = require('../api/_lib/catalog');

const PRODUCT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRIPE_PRODUCT = /^prod_[A-Za-z0-9]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const CATEGORIES = new Set(['billing', 'utilities']);
const KINDS = new Set(['one_time', 'subscription']);

function validateCatalog(catalog) {
  const errors = [];
  const stripeProducts = new Set();
  const fileKeys = new Set();

  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return ['catalog must be an object'];
  }

  for (const [id, product] of Object.entries(catalog)) {
    const fail = (field, message) => errors.push(`${id}.${field}: ${message}`);
    if (!PRODUCT_ID.test(id)) fail('id', 'must be a lowercase slug');
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      errors.push(`${id}: must be an object`);
      continue;
    }

    if (typeof product.name !== 'string' || !product.name.trim()) {
      fail('name', 'is required');
    }
    if (product.stripeProduct !== undefined && (typeof product.stripeProduct !== 'string' || !STRIPE_PRODUCT.test(product.stripeProduct))) {
      fail('stripeProduct', 'must be a Stripe product ID (prod_...)');
    } else if (product.stripeProduct !== undefined && stripeProducts.has(product.stripeProduct)) {
      fail('stripeProduct', `duplicates ${product.stripeProduct}`);
    } else if (product.stripeProduct !== undefined) {
      stripeProducts.add(product.stripeProduct);
    } else if (!product.retired) {
      fail('stripeProduct', 'is required unless the product is retired');
    }

    if (product.kind !== undefined && !KINDS.has(product.kind)) {
      fail('kind', "must be 'one_time' or 'subscription'");
    }
    if (product.retired !== undefined && typeof product.retired !== 'boolean') {
      fail('retired', 'must be true or false');
    }
    if (product.category !== undefined && !CATEGORIES.has(product.category)) {
      fail('category', "must be 'billing' or 'utilities'");
    }
    if (product.blurb !== undefined && (typeof product.blurb !== 'string' || !product.blurb.trim())) {
      fail('blurb', 'must be a non-empty string when provided');
    }
    if (product.version !== undefined && (typeof product.version !== 'string' || !VERSION.test(product.version))) {
      fail('version', 'must use major.minor.patch format');
    }
    if (product.appUrl !== undefined) {
      try {
        if (new URL(product.appUrl).protocol !== 'https:') fail('appUrl', 'must use HTTPS');
      } catch {
        fail('appUrl', 'must be a valid HTTPS URL');
      }
    }

    // A membership (includes) unlocks other products' downloads while its subscription is active.
    if (product.includes !== undefined) {
      if (!Array.isArray(product.includes) || !product.includes.length) {
        fail('includes', 'must be a non-empty list of product ids');
      } else {
        for (const inc of product.includes) {
          if (typeof inc !== 'string' || !Object.prototype.hasOwnProperty.call(catalog, inc)) fail('includes', `${inc} is not in the catalog`);
          else if (!catalog[inc] || !catalog[inc].fileKey) fail('includes', `${inc} has no download`);
          else if (catalog[inc].includes !== undefined) fail('includes', `${inc} is itself a membership`);
        }
      }
      if (product.kind !== 'subscription') fail('kind', "must be 'subscription' for a membership");
      if (product.fileKey !== undefined) fail('fileKey', 'a membership has no file of its own');
    }

    if (product.fileKey === undefined) {
      for (const field of ['filename', 'sha256']) {
        if (product[field] !== undefined) fail(field, `requires fileKey`);
      }
      continue;
    }

    const fileKey = product.fileKey;
    const segments = typeof fileKey === 'string' ? fileKey.split('/') : [];
    if (typeof fileKey !== 'string' || !segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || fileKey.startsWith('/') || fileKey.includes('\\') || /[\u0000-\u001f]/.test(fileKey)) {
      fail('fileKey', 'must be a safe relative object key');
    } else if (fileKeys.has(fileKey)) {
      fail('fileKey', `duplicates ${fileKey}`);
    } else {
      fileKeys.add(fileKey);
    }

    if (typeof product.filename !== 'string' || !product.filename.trim()
      || product.filename !== product.filename.split('/').pop()
      || product.filename.includes('\\') || product.filename === '.' || product.filename === '..') {
      fail('filename', 'must be a plain filename');
    } else if (typeof fileKey === 'string' && product.filename !== fileKey.split('/').pop()) {
      fail('filename', 'must match the final fileKey segment');
    }
    if (typeof product.sha256 !== 'string' || !SHA256.test(product.sha256)) {
      fail('sha256', 'must be a 64-character lowercase hexadecimal digest');
    }
  }

  return errors;
}

if (require.main === module) {
  const errors = validateCatalog(CATALOG);
  if (errors.length) {
    console.error(`Store item validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Validated ${Object.keys(CATALOG).length} store item(s).`);
  }
}

module.exports = { validateCatalog };
