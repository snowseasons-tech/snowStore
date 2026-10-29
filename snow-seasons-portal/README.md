# Snow Seasons Tech — Customer Portal Preview

Responsive, static proof-of-concept. This is **not** a production authentication or payments application.

## Run locally

```bash
cd snow-seasons-portal
python3 -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080 in your browser. Stop with Ctrl+C.

## What works

- Responsive branded interface and section navigation
- Application catalog and external link to CDOT Stations
- Explicit placeholder screens for Founders Access and billing

## What is intentionally **not** connected

- No real customer account/session or organization
- No Cloudflare Access validation
- No Stripe checkout, billing sessions, subscriptions, or webhooks
- No customer-specific entitlements or seat inventory

## Production integration roadmap

1. Deploy on `portal.snowseasonstech.net` behind Cloudflare Access.
2. Implement authenticated backend identity verification for Cloudflare JWTs (issuer, audience, signature, expiration).
3. Add PostgreSQL tenant, user, product, and entitlement models with per-tenant authorization.
4. Process signed Stripe webhooks and reconcile purchased entitlements, with idempotent processing and retries.
5. Replace demo catalog and account placeholders with authenticated API data.
6. Add a server-side Stripe Customer Portal session endpoint and product purchase links.
7. Integrate `cdot-stations` by validating identity and permissions on every protected route and API.
8. Add CI, security tests, backups, audit logs, and staging before production deployment.

**Security:** This frontend is not an access-control mechanism. Do not treat the `Open` link as proof of purchase or permission. Retain Cloudflare Access protection on Stations.
