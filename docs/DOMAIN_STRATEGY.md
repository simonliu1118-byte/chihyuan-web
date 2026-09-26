# Chihyuan Domain Strategy

Status: `chihyuancm.com` registered; rollout pending

This document records the current domain direction for Chihyuan's public website and CY-family Web systems. It is an architecture/operations planning note, not a permanent governance rule.

## 1. Registered parent domain

- `chihyuancm.com` is the confirmed long-term parent domain.
- The domain was registered through Cloudflare Registrar on 2026-09-27.
- Registration is maintained on an annual renewal basis.
- The same parent domain is intentionally used for both the official public website and Chihyuan internal/business Web systems.
- `chihyuancm` keeps the full Chihyuan brand spelling and avoids the legacy `jycm` abbreviation style.
- `CM` is used as a compact Chinese-medicine business identifier; public-facing branding may present it simply as `Chihyuan CM` while the website itself describes the business in full.
- The legacy public website domain may remain in service during migration. Cutover/redirect timing is a separate rollout decision.

## 2. Parent-domain model

Use one long-term parent domain rather than buying a separate domain for each application.

The official website and business systems share the same registrable parent domain, while each system remains on its own hostname/origin and deployment/security boundary.

Current namespace plan:

```text
chihyuancm.com                 Official public website
www.chihyuancm.com             Website alias / redirect

admin.chihyuancm.com           Chihyuan Enterprise Management System (CY Web)
accounting.chihyuancm.com      CYAccountingWeb
invoice.chihyuancm.com         CYInvoice Web
auth.chihyuancm.com            Shared identity / future CYCloud Identity
portal.chihyuancm.com          Future unified CY system portal, when needed
api.chihyuancm.com             Reserved for truly shared/API services when needed
```

Additional systems should normally receive a direct subdomain rather than introducing unnecessary extra levels such as `app.apps.<domain>`.

Application-specific APIs should normally remain same-origin under each application (for example `/api/*`). `api.chihyuancm.com` is reserved for a genuinely shared service and should not be introduced merely because an API exists.

## 3. Website and management-system boundary

Sharing `chihyuancm.com` as the parent domain does **not** mean the website and management systems share the same application origin, session, deployment, or privilege boundary.

Examples:

```text
https://chihyuancm.com
https://admin.chihyuancm.com
https://accounting.chihyuancm.com
https://invoice.chihyuancm.com
```

Each application remains separately deployable and independently protected.

The official website is public-facing. Internal/business systems may require authenticated access and may apply stronger controls appropriate to their risk level.

## 4. Security / implementation notes

- Prefer host-only session cookies for each application.
- Do not broadly set application session cookies to `Domain=.chihyuancm.com` merely for convenience.
- If shared SSO is introduced later, implement it explicitly through the shared identity boundary rather than by sharing application sessions.
- Keep the public website and internal systems as separate origins and deployments.
- Internal/high-risk administration endpoints may additionally use Cloudflare Access or an equivalent access-control layer where it improves security without creating unacceptable workflow friction.
- Remove stale DNS records when a subdomain/service is retired to reduce subdomain-takeover risk.
- Keep 2FA, registrar lock, DNSSEC where supported, recovery codes, and organizational backup administration enabled for the registrar/DNS account.
- Do not commit Cloudflare credentials, account/zone identifiers, origin secrets, private keys, production database identifiers, or other sensitive deployment metadata into the Public repository.

## 5. Cloudflare direction

- Cloudflare Registrar currently holds `chihyuancm.com`.
- Cloudflare DNS is the natural DNS control plane for the domain unless a later architecture decision changes that.
- Existing `*.workers.dev` addresses are technical/deployment addresses, not the long-term user-facing namespace.
- CY Web, CYAccountingWeb, CYInvoice Web, the future official website, and other Cloudflare-hosted services may continue running on Workers or other suitable hosting while being exposed through custom hostnames under `chihyuancm.com`.
- Registration, DNS, Worker Custom Domains, redirects, certificates, and cutover should be changed through controlled rollout rather than all at once.

## 6. Rollout timing

Domain naming is fixed now, but production DNS/custom-domain binding does not need to happen during early foundation development.

Preferred rollout sequence:

```text
application foundation
→ Identity/session/permission acceptance
→ production Worker / database boundary
→ major business workflows and UI nearing acceptance
→ bind production custom hostname(s)
→ verify TLS, redirects, cookies/session boundaries and browser/device access
→ final production acceptance
```

This keeps the domain strategy stable without making DNS/custom-domain rollout an early-development dependency.

## 7. Ownership

Domain namespace planning for the official website and CY-family Web systems is coordinated by the `chihyuan-web` workstream so naming does not drift between projects.

The confirmed baseline is:

> `chihyuancm.com` is the shared Chihyuan parent domain for the future official website and internal/business Web systems, with separate subdomains/origins and security boundaries for each application.

Future changes to the parent-domain strategy require an explicit business decision.
