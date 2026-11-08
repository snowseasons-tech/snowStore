// What a purchase unlocks for download. A membership (a catalog entry with `includes`) unlocks the file of each
// included product; any other product unlocks its own file, if it has one. Unknown ids unlock nothing.
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function downloadsFor(productId, catalog) {
  const p = has(catalog, productId) ? catalog[productId] : null;
  if (!p) return [];
  const ids = Array.isArray(p.includes) ? p.includes : [productId];
  return ids
    .filter((id) => has(catalog, id) && catalog[id].fileKey)
    .map((id) => ({ id, name: catalog[id].name, fileKey: catalog[id].fileKey, filename: catalog[id].filename }));
}

// A membership is a subscription that includes other products. A one-time bundle also lists them but is not a subscription.
const isMembership = (product) => !!product && Array.isArray(product.includes) && product.kind !== 'one_time';

module.exports = { downloadsFor, isMembership };
