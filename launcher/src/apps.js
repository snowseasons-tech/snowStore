// Everything the launcher opens. Add an app here. status: live, demo, private, or building (no url yet; note says what's left).
export const GROUPS = ['Snow Seasons Tech', 'American Tree', 'Accounts', 'In progress'];

export const STATUS = {
  live: 'Live',
  demo: 'Demo',
  private: 'Sign-in',
  building: 'Not ready',
};

export const APPS = [
  { id: 'store', name: 'Store', group: 'Snow Seasons Tech', status: 'live', url: 'https://snowseasonstech.store', note: 'Public storefront and checkout', keys: 'shop sell snowstore' },
  { id: 'products', name: 'Products', group: 'Snow Seasons Tech', status: 'live', url: 'https://snowseasonstech.store/products', note: 'Everything on sale, with live prices', keys: 'catalog pricing' },
  { id: 'portal', name: 'Customer portal', group: 'Snow Seasons Tech', status: 'private', url: 'https://snowseasonstech.store/storefront/portal.html', note: 'Where customers sign in and download apps', keys: 'downloads login' },
  { id: 'company', name: 'Company site', group: 'Snow Seasons Tech', status: 'live', url: 'https://snowseasonstech.net', note: 'snowseasonstech.net', keys: 'website' },
  { id: 'stations', name: 'CDOT Stations', group: 'Snow Seasons Tech', status: 'live', url: 'https://stations.snowseasonstech.net/inspections.html', note: 'Colorado inspection station insights', keys: 'inspections dottracker trucking' },

  { id: 'atc-site', name: 'American Tree website', group: 'American Tree', status: 'live', url: 'https://americantreeserviceco.com', note: 'Public site and estimate form', keys: 'tree colorado' },
  { id: 'atc-dash', name: 'Operations dashboard', group: 'American Tree', status: 'private', url: 'https://dash.americantreeserviceco.com', note: 'Jobs, estimates, leads and weather', keys: 'dash overview crew' },
  { id: 'atc-mail', name: 'Direct Mail Hub', group: 'American Tree', status: 'private', url: 'https://dash.americantreeserviceco.com/mailhub.html', note: 'Postcards and mailing lists', keys: 'mailhub mail campaign' },
  { id: 'stump', name: 'Stump Speech', group: 'American Tree', status: 'private', url: 'https://claude.ai/artifact/MA4n6qUvxmt1Fyv3pkZEht', note: 'Social post ideas and drafts', keys: 'social ideas inspiration posts' },

  { id: 'stripe', name: 'Stripe', group: 'Accounts', status: 'private', url: 'https://dashboard.stripe.com', note: 'Payments, subscriptions and prices', keys: 'billing payments' },
  { id: 'cloudflare', name: 'Cloudflare', group: 'Accounts', status: 'private', url: 'https://dash.cloudflare.com', note: 'Pages, Workers and DNS', keys: 'deploy hosting dns' },
  { id: 'resend', name: 'Resend', group: 'Accounts', status: 'private', url: 'https://resend.com/emails', note: 'Sent email and delivery', keys: 'mail email' },
  { id: 'gh-store', name: 'snowStore on GitHub', group: 'Accounts', status: 'private', url: 'https://github.com/snowseasons-tech/snowStore', note: 'Store, bundles and hosted setup', keys: 'code repo git' },
  { id: 'gh-site', name: 'American Tree on GitHub', group: 'Accounts', status: 'private', url: 'https://github.com/americantreeserviceco/website', note: 'Website code', keys: 'code repo git' },

  { id: 'hosted-social', name: 'Hosted Social Studio', group: 'In progress', status: 'building', note: 'Needs a server, a domain, and Meta and Google approval', keys: 'social media manager' },
  { id: 'mailhub-sw', name: 'MailHub for customers', group: 'In progress', status: 'building', note: 'Not built as customer software yet', keys: 'email marketing' },
  { id: 'bundles', name: 'Six software bundles', group: 'In progress', status: 'building', note: 'Drafts on the product-bundles branch, waiting on missing software', keys: 'plans pricing marketing automation suite' },
];
