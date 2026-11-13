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

const isMembership = (product) => !!product && Array.isArray(product.includes);

// The portal shows the Snow Seasons Tech coin to accounts holding the Founder's Early Access Membership. The portal's
// only entitlement is the account's product list (the same one app-download checks), so a lapsed member is
// simply an account whose list no longer has it.
const COIN_PRODUCT = 'founders-membership';
const hasCoin = (products) => Array.isArray(products) && products.includes(COIN_PRODUCT);

module.exports = { downloadsFor, isMembership, hasCoin };
