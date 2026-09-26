# Chihyuan Domain Strategy

Status: `chihyuancm.com` registered; rollout pending

This document records the current domain direction for Chihyuan's public website and CY-family Web systems. It is an architecture/operations planning note, not a permanent governance rule.

## 1. Registered parent domain

- `chihyuancm.com` was registered through Cloudflare Registrar on 2026-09-27 for an initial one-year term.
- For now, `chihyuancm.com` is the selected parent domain for the official Chihyuan website and CY-family Web systems.
- The initial one-year registration is intentional. After the new website/domain setup has been running stably in production, the registration term can be extended.
- `chihyuancm` keeps the full Chihyuan brand spelling and avoids the legacy `jycm` abbreviation style.
- `CM` is used as a compact Chinese-medicine business identifier; public-facing branding may present it simply as `Chihyuan CM` while the website itself describes the business in full.
- The legacy public website domain may remain in service during migration. Cutover/redirect timing is a separate rollout decision.

## 2. Parent-domain model

Use one long-term parent domain rather than buying a separate domain for each application.

The official website and business systems may share the same registrable parent domain, while each system remains on its own hostname/origin.

Planned namespace:

```text
chihyuancm.com                 Official website
www.chihyuancm.com             Website alias / redirect

portal.chihyuancm.com          CY system portal
admin.chihyuancm.com           Chihyuan Enterprise Management System / administration
accounting.chihyuancm.com      CYAccountingWeb
invoice.chihyuancm.com         CYInvoice Web
auth.chihyuancm.com            Shared identity / future CYCloud Identity
api.chihyuancm.com             Shared/API services when required
```

Additional systems should normally receive a direct subdomain rather than introducing unnecessary extra levels such as `app.apps.<domain>`.

## 3. Website and management-system boundary

Sharing `chihyuancm.com` as the parent domain does **not** mean the website and management systems should share the same application origin, session, deployment, or privilege boundary.

Keep separate origins such as:

```text
https://chihyuancm.com
https://accounting.chihyuancm.com
https://invoice.chihyuancm.com
https://admin.chihyuancm.com
```

Each application should remain separately deployable and independently protected.

## 4. Security / implementation notes

- Prefer host-only session cookies for each application.
- Do not broadly set application session cookies to `Domain=.chihyuancm.com` merely for convenience.
- If shared SSO is introduced later, implement it explicitly through the shared identity boundary rather than by sharing application sessions.
- Keep the public website and internal systems as separate origins and deployments.
- Internal/high-risk administration endpoints may additionally use Cloudflare Access or an equivalent access-control layer.
- Remove stale DNS records when a subdomain/service is retired to reduce subdomain-takeover risk.
- Keep 2FA, registrar lock, DNSSEC where supported, recovery codes, and organizational backup administration enabled for the registrar/DNS account.

## 5. Cloudflare direction

- Cloudflare Registrar currently holds `chihyuancm.com`.
- Cloudflare DNS will be the natural DNS control plane for the new domain unless a later architecture decision changes that.
- Existing `*.workers.dev` addresses remain technical/deployment addresses and should not be treated as the long-term public namespace.
- CY Web, CYAccountingWeb, CYInvoice Web, and other Cloudflare-hosted services may continue running on Workers while being exposed through custom subdomains under `chihyuancm.com`.
- Registration, DNS, Worker Custom Domains, redirects, certificates, and cutover should be changed through controlled rollout rather than all at once.

## 6. Rollout / ownership

Further domain work is owned by the `chihyuan-web` workstream and should be coordinated here so the official website and CY-family systems do not drift into separate naming plans.

Next implementation steps are expected to include:

1. confirm the initial official-site hosting/deployment target;
2. define the first production DNS records;
3. connect selected CY Web applications through Cloudflare Custom Domains;
4. verify SSL, redirects, origin/session boundaries, and mobile/desktop access;
5. plan migration/redirect behavior from the legacy website domain;
6. after stable production operation, extend the domain registration term beyond the initial one year.

The registered parent domain is therefore no longer a naming candidate; `chihyuancm.com` is the current rollout baseline unless a future explicit business decision changes it.
