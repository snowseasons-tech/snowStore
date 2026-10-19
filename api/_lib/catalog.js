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
  'bi-dashboard': {
    name: 'BI Engagement Dashboard',
    priceEnv: 'PRICE_BI_DASHBOARD',
    fileKey: 'bi-dashboard/bi-dashboard.html',
    filename: 'bi-dashboard.html',
    category: 'utilities',
    blurb: 'A single-file operations dashboard with KPI cards, pipeline charts, an engagement wizard and CSV export. No backend needed.',
    version: '1.0.0',
    sha256: 'ec9549da34d85b76a2059a231be5c716be471cabeb7cb0f1509ebac6ea1f1c2f',
  },
  'lead-generator': {
    name: 'Lead Generation Pipeline',
    priceEnv: 'PRICE_LEAD_GENERATOR',
    fileKey: 'lead-generator/lead-generator.zip',
    filename: 'lead-generator.zip',
    category: 'utilities',
    blurb: 'Turn a list of company names into websites, phone numbers and contact details. Python scripts you run on your own machine or on a schedule.',
    version: '1.0.0',
    sha256: 'af5645308b4682f9506d4453adfbcb44dfc826cf9f26f76e5e711534e259aae3',
  },
  // Example subscription product (uncomment, create the recurring Price in Stripe test mode first):
  // 'bi-dashboards': { name: 'BI Dashboards', kind: 'subscription', priceEnv: 'PRICE_BI_MONTHLY', appUrl: 'https://app.snowseasonstech.net/bi' },
};
