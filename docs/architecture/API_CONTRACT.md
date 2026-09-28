# CY Web API Contract — Initial Foundation

> Status: implementation contract for the initial Worker/API foundation. Business-module request/response fields are added incrementally from the Final Data Dictionary.

## 1. Scope

CY Web exposes same-origin application APIs under `/api/*` from the Cloudflare Worker.

The browser UI and Worker share TypeScript response contracts where practical. Server-side authorization and validation remain authoritative; browser validation is presentation/convenience only.

## 2. Response envelope

Every JSON API response uses one of two outer shapes.

Success:

```json
{
  "ok": true,
  "data": {},
  "requestId": "..."
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {
      "shortName": "Required"
    }
  },
  "requestId": "..."
}
```

`fields` is optional and is used only when field-specific feedback is useful.

The canonical TypeScript outer contract lives at `shared/api.ts`.

## 3. Request correlation

The Worker creates one `requestId` per request and returns it in the API envelope. The identifier is for troubleshooting/correlation; it is not a business ID and must not be used as an authorization token.

Do not put secrets, credentials, personal data or full request bodies into a request ID or generic error message.

## 4. Cache behavior

Business/API responses are returned with `Cache-Control: no-store` unless a later endpoint has an explicit safe caching design.

Static Web assets may use Cloudflare/Vite asset caching independently. Dynamic Customer, Order, WorkLog and other business data must not accidentally inherit static-asset caching behavior.

## 5. Initial HTTP status/error mapping

| HTTP | Stable error use |
| ---: | --- |
| 400 | malformed request / invalid JSON / unsupported request shape |
| 401 | no valid authenticated session |
| 403 | authenticated but not authorized |
| 404 | route or requested record not found |
| 409 | state/revision conflict, duplicate unique business key, or incompatible concurrent update |
| 422 | well-formed request that fails field/domain validation |
| 429 | rate/abuse control when introduced |
| 500 | unexpected internal error; do not leak stack/internal details to client |
| 503 | required dependency/service temporarily unavailable |

Stable `error.code` values are application contracts. Human `message` text may be localized/refined without changing the code.

## 6. Optimistic concurrency

Mutable business aggregates that carry `revision` require the client to send the revision it edited.

If the stored revision changed before update, the API rejects the stale write with HTTP `409` and a stable conflict error code. The UI then asks the user to reload/compare rather than silently overwriting another person's newer change.

Exact UI presentation is intentionally deferred to the UI/UX phase.

## 7. Validation boundary

The Worker validates:

- required fields and value shape;
- stable workflow codes;
- numeric/date constraints;
- referenced IDs where required;
- cross-row/domain rules not expressible safely as D1 constraints;
- authorization for protected actions.

D1 constraints are a second line of protection, not the only validation layer.

## 8. List/search direction

Business-list APIs should use bounded page sizes and server-side search/filtering instead of loading the entire D1 dataset into the browser as the Legacy GAS client did.

Initial conventions:

- `limit` has a server-controlled maximum;
- stable sort order is explicit;
- pagination token/cursor is opaque to the client where cursor pagination is used;
- search terms are treated as data, never interpolated into SQL;
- module-specific filters use explicit query parameters/contracts rather than one unrestricted SQL-like filter language.

The exact page size and cursor fields may be tuned per module after the first real list endpoint is implemented.

## 9. Health endpoint

`GET /api/health` is the initial non-business smoke endpoint.

It verifies that the Worker can reach its D1 binding using a non-sensitive query and returns no business data.

It does not prove that every schema migration or business module is ready; those checks remain part of deployment/acceptance.

## 10. Security/error hygiene

- Never return secrets, credentials, SQL text, stack traces or raw provider errors to the browser.
- Log only the minimum diagnostic metadata needed for troubleshooting.
- Authentication/authorization failures do not reveal protected record details.
- Audit events and operational logs are separate concerns; an API error does not automatically become a business Audit event.
