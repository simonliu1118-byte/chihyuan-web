# CY Web Domain Rollout Notes

> Working implementation notes for the confirmed `chihyuancm.com` namespace. The parent-domain decision is recorded in BD-056; operational naming lives in `../DOMAIN_STRATEGY.md`.

## Current implementation timing

Do not bind the production CY Web hostname during early foundation work merely because the domain is available.

The preferred gate is:

1. production Worker boundary accepted;
2. production D1/environment boundary accepted;
3. shared Identity/session flow accepted;
4. major CY Web workflows and UI are close to production acceptance;
5. bind `admin.chihyuancm.com` through Cloudflare Custom Domains;
6. verify TLS, redirects, host-only cookies/session behavior, Desktop/Tablet/Mobile access and failure handling;
7. retain the technical `workers.dev` route only as appropriate for deployment/operations, not as the normal user-facing address.

## Hostname responsibilities

- `chihyuancm.com` / `www.chihyuancm.com`: official public website.
- `admin.chihyuancm.com`: CY Web enterprise management system.
- Other application subdomains remain owned by their respective application workstreams when they are ready for rollout.
- `auth.chihyuancm.com` is reserved for the shared Identity boundary when that service is extracted/ready.
- `portal.chihyuancm.com` is future-facing and should not be created until a real portal exists.
- `api.chihyuancm.com` is reserved for truly shared services; CY Web's own API remains same-origin under `/api/*` unless a future requirement changes that.

## Public repository boundary

Public architecture may name the registered domain and planned public/subdomain namespace. Do not commit secrets or sensitive deployment identifiers such as credentials, private keys, origin secrets, production database IDs, or provider account/zone identifiers.
