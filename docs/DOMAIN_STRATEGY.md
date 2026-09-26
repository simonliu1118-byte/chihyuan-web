# Chihyuan Domain Strategy

Status: planning / not yet purchased

This document records the current domain-planning direction for Chihyuan's public website and CY-family Web systems. It is an architecture/planning note, not a permanent governance rule.

## 1. Current direction

- Prefer one long-term **parent domain** for both the official Chihyuan website and internal/business Web systems.
- Do **not** purchase a separate domain for each application.
- Use subdomains to separate applications, origins, deployment boundaries, authentication scope, and operational ownership.
- Current leading naming direction: `chihyuancm`.
- `CM` is intended to connect the domain name to Chihyuan's Chinese-medicine business. Final public-facing expansion/wording of `CM` can be finalized with the website branding.

Current candidates, in priority order for further registrar availability/price confirmation:

1. `chihyuancm.com`
2. `chihyuancm.tw`
3. `chihyuancm.com.tw`

No candidate is considered final until registration is completed.

## 2. Intended namespace

If `chihyuancm.com` is selected, the intended structure is:

```text
chihyuancm.com                 Official website
www.chihyuancm.com             Website alias / redirect

portal.chihyuancm.com          CY system portal
admin.chihyuancm.com           Enterprise administration
accounting.chihyuancm.com      CYAccountingWeb
invoice.chihyuancm.com         CYInvoice Web
auth.chihyuancm.com            Shared identity / future CYCloud Identity
api.chihyuancm.com             Shared/API services when required
```

Additional systems should normally receive their own direct subdomain rather than introducing unnecessary extra levels such as `app.apps.<domain>`.

## 3. Website and management systems may share the parent domain

Using the same parent domain for the official website and management systems is intentional and acceptable.

The key boundary is the **hostname/origin**, not the registrable parent domain:

```text
https://chihyuancm.com
https://accounting.chihyuancm.com
https://invoice.chihyuancm.com
https://admin.chihyuancm.com
```

These should remain separately deployable applications with independent security and session boundaries.

## 4. Security / implementation notes

- Prefer host-only session cookies for each application.
- Do not broadly set authentication/session cookies to `Domain=.chihyuancm.com` merely for convenience.
- If shared SSO is introduced later, design it explicitly through the shared identity boundary rather than implicitly sharing application sessions.
- Keep the public website and internal systems as separate origins and deployments.
- Internal/high-risk administration endpoints may additionally use Cloudflare Access or an equivalent access-control layer.
- Remove stale DNS records when a subdomain/service is retired to reduce subdomain-takeover risk.
- The registrar/DNS account should use 2FA, registrar lock, DNSSEC where supported, recovery-code retention, and organizational ownership/backup administration.

## 5. Cloudflare direction

- Existing `*.workers.dev` addresses are temporary technical/deployment addresses, not the desired long-term public namespace.
- Production CY Web systems may continue running on Cloudflare Workers while being exposed through custom subdomains under the selected Chihyuan parent domain.
- Registration provider and DNS provider do not have to be the same vendor; a `.tw` / `.com.tw` domain can still use Cloudflare DNS and Cloudflare-hosted applications.

## 6. Decision still pending

Before purchase, confirm for the three leading candidates:

- real-time registrar availability;
- normal vs. premium registration status;
- first-year price;
- renewal price;
- registrar transfer/ownership requirements.

The final registered domain should then become the canonical enterprise namespace for the official website and CY-family Web systems.
