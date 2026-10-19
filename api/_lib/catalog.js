// Products we sell. Prices live in Stripe: priceEnv names the env var holding the Price ID.
// kind: 'one_time' (default) or 'subscription'. fileKey = object key in the PRIVATE bucket (optional).
// appUrl (optional) = where a subscriber opens the hosted micro-SaaS.
// Customer portal (optional): category ('billing' | 'utilities', matches the portal filter), version, sha256 of the file.
// blurb (optional) = one-line description shown on the portal product cards.
module.exports = {
  bookscan: {
    name: 'BookScan Live',
    priceEnv: 'PRICE_BOOKSCAN',
    fileKey: 'bookscan-live/bookscan-live.html',
    filename: 'bookscan-live.html',
    category: 'utilities',
    blurb: 'Scan or type an ISBN for a live lookup, estimated used-market value and a quick profit check. Built for book resellers.',
    version: '1.0.0',
    // sha256sum of the exact file uploaded to fileKey; update with every new upload.
    sha256: '922615091fb869e18c10a02a51f4fb529496955166006646a1cc3d06a1455247',
  },
  'vanilla-webpage': {
    name: 'Vanilla Webpage Template',
    priceEnv: 'PRICE_VANILLA_WEBPAGE',
    fileKey: 'vanilla-webpage/vanilla-webpage.html',
    filename: 'vanilla-webpage.html',
    category: 'utilities',
    blurb: 'A lightweight single-file products page with light/dark theme, responsive layout and no dependencies. Open it in a browser and it works.',
    version: '1.0.0',
    sha256: 'e9783abe5d22df5702139dae7ee824ad4295f1633a2a728db7de5e9f8c527283',
  },
  // Example subscription product (uncomment, create the recurring Price in Stripe test mode first):
  // 'bi-dashboards': { name: 'BI Dashboards', kind: 'subscription', priceEnv: 'PRICE_BI_MONTHLY', appUrl: 'https://app.snowseasonstech.net/bi' },
};
