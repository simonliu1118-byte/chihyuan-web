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

## 11. CY Web Module Access

CY Web business-module entry uses server-authoritative, application-local Module Access. Workspace Role and CYID Application Access are separate dimensions.

Current fixed business modules:

```text
CUSTOMERS
ITEMS
DEFECTS
ORDERS
OUTSOURCING
WORKLOGS
```

Endpoints:

| Method | Path | Authority | Purpose |
| --- | --- | --- | --- |
| GET | `/api/module-access` | any authenticated CY Web Employee | return current effective business modules; Super Admin receives implicit all |
| GET | `/api/module-access/check/:moduleCode` | authenticated + requested module grant | authoritative module-entry check; returns 403 `ACCESS_DENIED` when absent |
| GET | `/api/module-access/admin` | Identity Admin / Super Admin | return direct Employee × Module grants for account-management UI |
| PUT | `/api/module-access/admin/employees/:employeeId/modules/:moduleCode` | Identity Admin / Super Admin | enable/disable one direct Module Access grant |

Mutation rules:

- normal ADMIN cannot call Module Access administration APIs;
- Identity Admin cannot change their own Module Access;
- Super Admin Module Access is implicit/all-enabled and cannot be converted into ordinary stored grants;
- target Employee/role is revalidated against current CYID authority on every mutation;
- grant mutation and CY Web audit event are written in one D1 batch;
- changes affect subsequent module checks immediately and do not require re-login;
- browser navigation filtering is convenience only; protected Worker/business routes must call the server-side Module Access guard before reading or mutating protected data.

`app_tags / app_tag_modules / app_member_tags` are not forward authorization sources. The authoritative store is `app_member_module_access`.

## 12. Protected Business HTTP API — Phase 1

CY Web 0.5 Phase 1 exposes the existing D1 domain services for Customer, Item and Defect through same-origin Worker APIs.

Every route below resolves the current CYID session and requires the matching **current server-side CY Web Module Access before the domain service is touched**.

### Customer — `CUSTOMERS`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/customers` | bounded search/list |
| POST | `/api/business/customers` | create Customer |
| GET | `/api/business/customers/:customerId` | detail |
| PATCH | `/api/business/customers/:customerId` | revision-gated update |
| GET | `/api/business/customers/tax-id-check` | duplicate Tax ID preflight |

### Item — `ITEMS`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/items` | bounded search/list |
| POST | `/api/business/items` | create Item |
| GET | `/api/business/items/:itemId` | detail |
| PATCH | `/api/business/items/:itemId` | revision-gated update |
| GET | `/api/business/items/:itemId/number-history` | Item number history |
| POST | `/api/business/items/:itemId/number` | controlled Item number change |

### Defect — `DEFECTS`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/defects` | bounded search/list |
| POST | `/api/business/defects` | create Defect report |
| GET | `/api/business/defects/:defectId` | detail |
| PATCH | `/api/business/defects/:defectId` | revision-gated edit |
| POST | `/api/business/defects/:defectId/start-processing` | created → processing |
| POST | `/api/business/defects/:defectId/resolve` | processing → resolved |
| POST | `/api/business/defects/:defectId/reopen` | resolved → processing |
| POST | `/api/business/defects/:defectId/invalidate` | durable invalidation |
| DELETE | `/api/business/defects/:defectId` | delete still-created report under service rules |

### Authorization and mutation context

- Missing/invalid provider session → `401 AUTH_REQUIRED/AUTH_INVALID`.
- CYID unavailable → `503 IDENTITY_UNAVAILABLE`.
- Authenticated Employee without the matching Module Access → `403 ACCESS_DENIED`.
- Super Admin retains implicit all-module access.
- Mutation `actorMemberId` always comes from the authorized CY Web `app_members` projection returned by the Module Access guard; it is never accepted from browser JSON.
- Destructive Defect administrative delete authority is derived from the current Workspace Role, not a client flag.
- Domain validation, D1 constraints, optimistic `revision` checks and existing Audit logic remain in the established service/persistence layer.

Browser navigation filtering is not sufficient authorization. Directly calling any `/api/business/*` endpoint still performs the server-side Module Access check.

Phase 1 does **not** yet move the React Customer / Item / Defect pages off localStorage. The next transport-migration phase will make those pages consume these APIs without changing the domain contract.

Order / Outsourcing / WorkLog protected routes follow this same boundary in the next API phase.

