# Chihyuan Domain Strategy

Status: `chihyuancm.com` registered; CYAccountingWeb `acc.chihyuancm.com` live; CY Web `admin.chihyuancm.com` live

This document records the current domain direction for Chihyuan's public website and CY-family Web systems. It is an architecture/operations planning note, not a permanent governance rule.

## 1. Registered parent domain

- `chihyuancm.com` is the confirmed long-term parent domain.
- The domain was registered through Cloudflare Registrar on 2026-09-27 with an initial one-year registration term.
- Renewal/registration term may later be extended to multiple years when appropriate; the exact renewal term is an operational choice and does not change the domain architecture.
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
acc.chihyuancm.com             CYAccountingWeb
invoice.chihyuancm.com         CYInvoice Web
auth.chihyuancm.com            Shared identity / future CYCloud Identity
portal.chihyuancm.com          Future unified CY system portal, when needed
api.chihyuancm.com             Reserved for truly shared/API services when needed
```

`admin.chihyuancm.com` is the permanent canonical user-facing hostname for CY Web. CY Web does **not** use a separate `dev-admin.*` hostname. Development browser/E2E acceptance may temporarily run against a development Worker/database behind this canonical hostname; later production cutover changes the Cloudflare backing Worker/database, not the public URL.

`acc.chihyuancm.com` is the confirmed CYAccountingWeb user-facing hostname. The shorter `acc` label is intentional for routine business use and replaces the earlier planning placeholder `accounting.chihyuancm.com`.

Additional systems should normally receive a direct subdomain rather than introducing unnecessary extra levels such as `app.apps.<domain>`.

Application-specific APIs should normally remain same-origin under each application (for example `/api/*`). `api.chihyuancm.com` is reserved for a genuinely shared service and should not be introduced merely because an API exists.

## 3. Website and management-system boundary

Sharing `chihyuancm.com` as the parent domain does **not** mean the website and management systems share the same application origin, session, deployment, or privilege boundary.

Examples:

```text
https://chihyuancm.com
https://admin.chihyuancm.com
https://acc.chihyuancm.com
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

### CY Web canonical-hostname rule

- Canonical URL: `https://admin.chihyuancm.com`.
- User-facing Identity links (first activation, Email re-verification, password/account flows) should point to the canonical URL once the CYCloud Identity portal setting is updated.
- The development Worker may keep its `workers.dev` URL enabled strictly as a technical fallback and diagnostics endpoint.
- The canonical hostname is managed as a Cloudflare Worker Custom Domain in the CY Web deployment contract rather than as an ad-hoc manual DNS record.
- Future development-to-production cutover must preserve `admin.chihyuancm.com`; only the backing Worker/database boundary changes.

## 5. Cloudflare direction

- Cloudflare Registrar currently holds `chihyuancm.com`.
- Cloudflare DNS is the natural DNS control plane for the domain unless a later architecture decision changes that.
- Existing `*.workers.dev` addresses are technical/deployment addresses, not the long-term user-facing namespace.
- CY Web, CYAccountingWeb, CYInvoice Web, the future official website, and other Cloudflare-hosted services may continue running on Workers or other suitable hosting while being exposed through custom hostnames under `chihyuancm.com`.
- Registration, DNS, Worker Custom Domains, redirects, certificates, and cutover should be changed through controlled rollout rather than all at once.

### CYAccountingWeb rollout status

- `acc.chihyuancm.com` was bound to the production CYAccountingWeb Worker on 2026-09-29.
- Production deployment contract now carries an App-scoped hostname variable rather than a generic shared domain variable.
- CYAccountingWeb explicitly retains its `workers.dev` URL as a technical fallback during this stage.
- User smoke testing of the Custom Domain succeeded on 2026-09-29.
- This rollout does not imply that `auth.chihyuancm.com`, `invoice.chihyuancm.com`, or the public website hostname have completed their own rollout.

### CY Web rollout status

- `admin.chihyuancm.com` was bound to the governed CY Web development deployment on 2026-09-29 and is the live canonical hostname.
- Deployment acceptance passed TLS/custom-domain routing, same-origin `/api/auth/me`, invalid-session cookie clearing, and the `workers.dev` technical fallback.
- CY Web intentionally skips a separate development hostname so Identity/browser acceptance occurs on the long-term origin from this point forward.
- During the current development phase, the canonical hostname resolves to the development CY Web Worker/D1.
- Production acceptance later rebinds the same hostname to production CY Web resources; this is an infrastructure cutover, not a user-facing URL migration.
- `workers.dev` remains enabled as a technical fallback until a later explicit decision removes it.

## 6. Rollout timing

Domain naming is fixed now. Individual applications may bind their canonical hostname earlier than final production when doing so materially improves browser/session/Identity acceptance, provided the backing environment remains explicit and governed.

CY Web is intentionally taking this path because activation links, HttpOnly cookies, TLS/origin behavior and account-management E2E should be accepted on the same long-term hostname users will keep.

Current CY Web sequence:

```text
Identity/session/permission foundation
→ bind admin.chihyuancm.com to governed development deployment
→ verify TLS, same-origin APIs, cookies/session boundaries and Identity deep links
→ complete role/Access/module/business-data acceptance
→ prepare production Worker / production D1 / backup boundary
→ rebind the same admin.chihyuancm.com hostname to production resources
→ final production acceptance
```

CYAccountingWeb reached its custom-hostname rollout independently. Binding `acc.chihyuancm.com` does not require waiting for CY Web or CYCloud Identity production-domain rollout because each application keeps its own origin/session boundary.

## 7. Ownership

Domain namespace planning for the official website and CY-family Web systems is coordinated by the `chihyuan-web` workstream so naming does not drift between projects.

The confirmed baseline is:

> `chihyuancm.com` is the shared Chihyuan parent domain for the future official website and internal/business Web systems, with separate subdomains/origins and security boundaries for each application.

For CY Web specifically:

> `https://admin.chihyuancm.com` is the permanent canonical URL. Environment changes may replace the backing Worker/database but must not introduce a new user-facing CY Web hostname without an explicit business decision.

Future changes to the parent-domain strategy require an explicit business decision.
