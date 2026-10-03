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
| POST | `/api/business/customers/:customerId/number` | controlled ERP Customer-number assignment/correction/clear |
| GET | `/api/business/customers/tax-id-check` | duplicate Tax ID preflight |
| GET | `/api/business/customers/item-options` | bounded active Item picker under CUSTOMERS authority |

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
| GET | `/api/business/defects/lookups` | bounded Customer / Item / owner picker data under DEFECTS authority |
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

Phase 1 established the protected domain API boundary. React transport migration is tracked separately below; Item and Customer have now moved to Worker API → D1 while Defect and later modules still retain temporary browser-local presentation adapters.

Order / Outsourcing / WorkLog protected routes follow this same boundary in the next API phase.

## 13. Protected Business HTTP API — Phase 2

CY Web 0.5 Phase 2 exposes the existing D1 domain services for Sales Work Order, Outsourcing and WorkLog through the same server-authoritative boundary used by Phase 1.

Every route below resolves the current CYID session and requires the matching current CY Web Module Access **before** the domain service is constructed or touched.

### Sales Work Order — `ORDERS`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/orders` | bounded search/list |
| POST | `/api/business/orders` | create draft order |
| GET | `/api/business/orders/:orderId` | detail |
| PATCH | `/api/business/orders/:orderId` | revision-gated draft update |
| DELETE | `/api/business/orders/:orderId` | administrative hard delete under service rules |
| POST | `/api/business/orders/:orderId/erp` | fill/correct ERP number |
| POST | `/api/business/orders/:orderId/waiting-stock` | transition to waiting stock |
| POST | `/api/business/orders/:orderId/picked` | mark picked |
| POST | `/api/business/orders/:orderId/shipped` | mark shipped |
| POST | `/api/business/orders/:orderId/reverse-shipment` | administrative shipment reversal |
| POST | `/api/business/orders/:orderId/void` | void order under workflow rules |

### Outsourcing — `OUTSOURCING`

Scoped references:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/outsourcing/lookups` | bounded active/selected Item projection with allowed units + current actor under OUTSOURCING authority |

Contractor:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/outsourcing/contractors` | bounded contractor search/list |
| POST | `/api/business/outsourcing/contractors` | create contractor |
| GET | `/api/business/outsourcing/contractors/:contractorId` | detail |
| PATCH | `/api/business/outsourcing/contractors/:contractorId` | revision-gated update |
| DELETE | `/api/business/outsourcing/contractors/:contractorId` | administrative hard delete when never used |
| PUT | `/api/business/outsourcing/contractors/:contractorId/prices` | set current contractor price |

BOM / stock:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/outsourcing/boms` | bounded BOM search/list |
| POST | `/api/business/outsourcing/boms` | create BOM |
| GET | `/api/business/outsourcing/boms/:bomId` | detail |
| PATCH | `/api/business/outsourcing/boms/:bomId` | revision-gated update |
| GET | `/api/business/outsourcing/stock?contractorId=...` | contractor stock balances |

Outsourcing order:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/outsourcing/orders` | bounded search/list |
| POST | `/api/business/outsourcing/orders` | create pending order |
| GET | `/api/business/outsourcing/orders/:orderId` | detail |
| PATCH | `/api/business/outsourcing/orders/:orderId` | update pending order |
| DELETE | `/api/business/outsourcing/orders/:orderId` | hard delete pending order under service rules |
| POST | `/api/business/outsourcing/orders/:orderId/confirm-outbound` | confirm outbound |
| POST | `/api/business/outsourcing/orders/:orderId/correct-outbound` | administrative outbound correction |
| POST | `/api/business/outsourcing/orders/:orderId/cancel-outbound` | administrative outbound cancellation |
| POST | `/api/business/outsourcing/orders/:orderId/receive` | receive returned goods |
| POST | `/api/business/outsourcing/orders/:orderId/cancel-receipt` | cancel receipt |
| POST | `/api/business/outsourcing/orders/:orderId/price` | price completed work |
| POST | `/api/business/outsourcing/orders/:orderId/cancel-pricing` | cancel pricing |
| POST | `/api/business/outsourcing/orders/:orderId/paid` | mark paid |
| POST | `/api/business/outsourcing/orders/:orderId/cancel-payment` | cancel payment |

### WorkLog — `WORKLOGS`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/worklogs` | bounded search/list; ordinary users are scoped to self |
| POST | `/api/business/worklogs` | create own WorkLog |
| GET | `/api/business/worklogs/:workLogId` | detail under current access context |
| PATCH | `/api/business/worklogs/:workLogId` | update own created WorkLog |
| DELETE | `/api/business/worklogs/:workLogId` | owner/admin delete under service rules |
| GET | `/api/business/worklogs/configuration` | active configuration; inactive values only for administration |
| GET | `/api/business/worklogs/statistics` | statistics; ordinary users are scoped to self |
| POST | `.../:workLogId/submit` | owner submits for review |
| POST | `.../:workLogId/withdraw` | owner withdraws pending review |
| POST | `.../:workLogId/review` | ADMIN / Super Admin review |
| POST | `.../:workLogId/cancel-review` | ADMIN / Super Admin cancel review |

### Server-derived authority

- Order hard-delete and shipment-reversal capability comes from current Workspace Role.
- Outsourcing hard-delete / outbound-correction / outbound-cancellation capability comes from current Workspace Role.
- WorkLog cross-employee read, review and administrative-delete capability comes from current Workspace Role.
- The browser cannot submit or elevate these permission flags.
- Mutation actor is always the authorized CY Web member projection returned by the Module Access guard.

Normal module users retain the workflow actions permitted by the domain service. ADMIN with the matching Module Access receives the module-level administrative actions defined by current CY Web rules; Super Admin remains implicit all-module.

### Reference generation

The current canonical data model requires unique order/work-log references but does not yet define a final human business-number format for Sales Work Order, Outsourcing Order or WorkLog.

Phase 2 therefore generates bounded unique internal references from Worker-side cryptographic UUID material. It **does not** promote preview strings such as `PREVIEW-*` or invent an ERP/business numbering policy.

If a later product decision defines a formal numbering sequence, the reference-provider interface is the replacement boundary; API authorization and domain workflow do not need to change.

Phase 2 still does not switch React business pages away from localStorage. Frontend transport migration is the next stage after all six business modules have protected Worker/D1 APIs.

## 14. Frontend transport-readiness APIs

Before React business pages move off the temporary localStorage runtime, the Worker exposes the canonical lookup and Customer-related operations that the current UI requires.

All endpoints below remain behind the owning module's current server-side Module Access guard.

### Customer module lookup — `CUSTOMERS`

`GET /api/business/customers/lookups`

Returns only the Customer module's required read references:

- current actor `appMemberId / employeeNo / displayName`;
- departments;
- customer categories;
- customer statuses;
- regions.

The endpoint does **not** return App Tags, WorkLog scoring configuration or unrelated Settings administration data.

Customer lifecycle in D1 uses `customer_status_id`. The temporary localStorage-only `isActive` field is not a canonical Customer authority and must not be reintroduced into D1 merely to preserve the old local UI.

### Customer transport-readiness operations — `CUSTOMERS`

`GET /api/business/customers/item-options` returns a bounded active-Item picker projection for Customer quote/frequent-item workflows. It stays behind `CUSTOMERS` Module Access and therefore does **not** require the user to also hold `ITEMS` Module Access. The projection is read-only and exposes only `id / itemNo / name / spec / baseUnit`.

`POST /api/business/customers/:customerId/number` is the controlled ERP Customer-number mutation. It requires the current Customer `revision`, enforces uniqueness, increments the aggregate revision, and records Shared Audit. Ordinary Customer `PATCH` continues to reject a Customer-number change.

### Customer related operations — `CUSTOMERS`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/business/customers/:customerId/visits` | bounded visit history |
| POST | `/api/business/customers/:customerId/visits` | create visit |
| PATCH | `/api/business/customers/:customerId/visits/:visitId` | revision-gated visit update |
| DELETE | `/api/business/customers/:customerId/visits/:visitId` | revision-gated visit delete |
| GET | `/api/business/customers/:customerId/frequent-items` | frequent-item list |
| POST | `/api/business/customers/:customerId/frequent-items` | create frequent item |
| PATCH | `/api/business/customers/:customerId/frequent-items/:frequentItemId` | updated-at-gated update |
| DELETE | `/api/business/customers/:customerId/frequent-items/:frequentItemId` | updated-at-gated delete |
| GET | `/api/business/customers/:customerId/quotes` | bounded quote history |
| POST | `/api/business/customers/:customerId/quotes` | create quote |
| GET | `/api/business/customers/:customerId/quotes/:quoteId` | quote detail |
| POST | `/api/business/customers/:customerId/quotes/:quoteId/correct` | correction preserving quote history |

Mutation actor IDs always come from the authorized `CUSTOMERS` Module Access guard. The browser cannot select an arbitrary audit actor.

### Item module lookup — `ITEMS`

`GET /api/business/items/lookups`

Returns:

- current actor `appMemberId / employeeNo / displayName`;
- canonical Item categories, including active state and hierarchy metadata.

The endpoint intentionally excludes unrelated Settings data.

### Settings read model alignment

`SettingsSnapshot` includes canonical `regions` in addition to departments, Customer categories/statuses and Item categories. Regions remain controlled reference data; adding them to the read model does not make them a normal editable structural lookup.

These transport-readiness endpoints remove the need for React forms to derive canonical IDs from local seed labels. The next frontend migration phase must send canonical lookup IDs and domain revisions supplied by D1.

## 15. React transport cutover — Item

Item is the first business React page whose forward data authority is Worker API → D1 rather than the temporary browser-local runtime.

The Item page uses:

- `GET /api/business/items/lookups`;
- `GET /api/business/items`;
- `GET /api/business/items/:itemId`;
- `POST /api/business/items`;
- `PATCH /api/business/items/:itemId`;
- `POST /api/business/items/:itemId/number`;
- `GET /api/business/items/:itemId/number-history`.

Browser requirements:

- canonical `itemCategoryId` is sent instead of a local category-name label;
- persisted fixed-point values cross the browser/API boundary as decimal strings;
- update and controlled Item-number mutation send the current `revision`;
- stale writes surface the Worker conflict response instead of overwriting local state;
- API failure never falls back to `localStorage` Item writes;
- the page does not read Defect-derived counts unless the user separately holds `DEFECTS` authority and a later cross-module contract explicitly allows that projection.

The legacy `LocalItem` type may remain temporarily because not-yet-migrated Order/Outsourcing local fixtures reference Item IDs. Its presence in the local schema does not make it Item-module authority.

Global runtime presentation must describe this as a mixed migration state until the remaining business pages also use Worker/D1.


## 16. React transport cutover — Customer

Customer is the second business React page whose forward data authority is Worker API → D1 rather than the temporary browser-local runtime.

The Customer page uses:

- `GET /api/business/customers/lookups`;
- `GET /api/business/customers/item-options`;
- `GET /api/business/customers`;
- `GET /api/business/customers/:customerId`;
- `POST /api/business/customers`;
- `PATCH /api/business/customers/:customerId`;
- `GET /api/business/customers/tax-id-check`;
- `POST /api/business/customers/:customerId/number`;
- Customer Visit / Frequent Item / Quote related endpoints from section 14.

Browser requirements:

- canonical lookup IDs are sent for category/status/region rather than local display labels;
- `customer_status_id` remains the Customer lifecycle/status authority; the retired local-only `isActive` flag is not recreated as D1 authority;
- duplicate Tax ID save requires the server preflight/confirmation contract;
- profile and related-record updates carry the server concurrency token (`revision` or `updatedAt`) required by that aggregate;
- ERP Customer-number assignment/correction/clear uses the controlled number endpoint and cannot be smuggled through ordinary profile update;
- Customer quote/frequent-item selection uses the Customer-scoped Item picker and does not require separate `ITEMS` Module Access;
- API failure never falls back to `localStorage` Customer writes;
- the former browser-local hard-delete/deactivate simulation is not carried forward without a canonical server lifecycle/delete contract;
- Shared Audit remains the durable mutation history; until a dedicated Audit read UI is added, the Customer page must not fabricate an activity history from local browser state.

Legacy Customer fixture types may remain temporarily because not-yet-migrated modules can still reference Customer IDs in their browser-local fixtures. Their presence does not make Customer-module data browser-authoritative.

## 17. React transport cutover — Defect

Defect is the third business React page whose forward data authority is Worker API → D1 rather than the temporary browser-local runtime.

The Defect page uses:

- `GET /api/business/defects/lookups`;
- `GET /api/business/defects`;
- `GET /api/business/defects/:defectId`;
- `POST /api/business/defects`;
- `PATCH /api/business/defects/:defectId`;
- explicit lifecycle endpoints for start-processing / resolve / reopen / invalidate;
- `DELETE /api/business/defects/:defectId` for the existing created-only service rule.

Browser requirements:

- Customer / Item / owner choices use bounded server projections under `DEFECTS` Module Access; the page does not read Customer or Item browser-local stores as authority;
- create/update send canonical IDs and current `revision` values supplied by D1;
- status is never a freely editable client field; lifecycle changes use the dedicated server actions;
- invalidation remains a durable overlay, not a fourth workflow status;
- hard-delete eligibility and administrative authority remain server-derived;
- stale writes surface Worker conflict responses instead of silently overwriting newer state;
- API failure never falls back to `localStorage` Defect writes.

Legacy `LocalDefect` fixtures may remain temporarily only where not-yet-migrated browser-local modules still need fictional development relationships. Their presence does not make Defect-module data browser-authoritative.

## 18. React transport cutover — Sales Work Order

Sales Work Order is the fourth business React page whose forward data authority is Worker API → D1 rather than the temporary browser-local runtime.

The Order page uses:

- `GET /api/business/orders/lookups` for bounded Customer / Item / operator projections under `ORDERS` Module Access;
- `GET /api/business/orders` and `GET /api/business/orders/:orderId`;
- `POST /api/business/orders` and `PATCH /api/business/orders/:orderId`;
- `POST /api/business/orders/:orderId/erp` for ERP fill/correction;
- `POST /api/business/orders/:orderId/waiting-stock`;
- `POST /api/business/orders/:orderId/picked`;
- `POST /api/business/orders/:orderId/shipped`;
- `POST /api/business/orders/:orderId/reverse-shipment`;
- `POST /api/business/orders/:orderId/void`;
- `DELETE /api/business/orders/:orderId` for the existing server-authorized draft-delete rule.

Browser requirements:

- Customer / Item / operator choices come from the `ORDERS`-guarded lookup projection and do not require separate `CUSTOMERS` or `ITEMS` Module Access;
- selected Item options include the base unit plus allowed conversion units needed for line validation;
- quantities and unit prices stay decimal strings across the browser/API boundary;
- draft update, ERP fill/correction, lifecycle actions and delete carry the current D1 `revision`;
- first ERP fill and later ERP correction use the dedicated action; ordinary draft PATCH never mutates ERP relationship state;
- shipment reversal and hard-delete authority remain server-derived from the current principal; browser button visibility is not authorization;
- workflow state changes use explicit server actions rather than a generic client-side status setter;
- API failure never falls back to `localStorage` Sales Work Order writes.

Legacy `LocalSalesOrder` fixtures may remain temporarily only because the not-yet-migrated local runtime is still being dismantled module by module. The active `#orders` route does not use those fixtures as authority.

## 19. React transport cutover — Contractor / BOM / Outsourcing

Outsourcing is the fifth business React page whose active route uses Worker API → D1 rather than browser-local business authority.

The integrated page uses:

- `GET /api/business/outsourcing/lookups` for current actor and bounded active/selected Item options with allowed units;
- Contractor list/detail/current-price reads under `/api/business/outsourcing/contractors`;
- BOM list/detail reads under `/api/business/outsourcing/boms`;
- `GET /api/business/outsourcing/stock?contractorId=...` for movement-derived stock balances;
- Outsourcing order list/detail/create/update/delete and explicit lifecycle/correction endpoints from the Phase 2 table.

Browser requirements:

- Item selection is an `OUTSOURCING`-guarded read projection and does not require separate `ITEMS` Module Access;
- the current authenticated actor is used as the order/receipt/pricing operator in the current React workflow; the page does not offer arbitrary Employee impersonation;
- quantities and Contractor Price values remain decimal strings across the API boundary;
- pending-order edit, outbound correction, receiving, pricing, payment and reverse actions carry the current D1 revision;
- confirmed outbound stock is represented only by `contractor_stock_movements`; the browser never maintains a second stock balance authority;
- outbound correction/cancellation and pending hard-delete capability remain server-derived from current Workspace authority;
- receive/BOM consumption, pricing and all reverse operations are computed/validated by the domain service;
- API failure never falls back to browser-local Outsourcing, Contractor, BOM or stock writes.

Legacy local Contractor/BOM/Outsourcing fixtures may remain temporarily only for not-yet-migrated development surfaces until the last local business page is removed. The active `#outsourcing` route does not use those fixtures as authority.


## WorkLog protected lifecycle transport

- `POST /api/business/worklogs/:workLogId/submit`
- `POST /api/business/worklogs/:workLogId/withdraw`
- `POST /api/business/worklogs/:workLogId/review`
- `POST /api/business/worklogs/:workLogId/cancel-review`

All operations use existing WORKLOGS Module Access, member ownership, administrative review permission and optimistic revision checks. No browser-local persistence fallback exists.

## Settings / Audit HTTP transport

ADMIN / SUPER_ADMIN may read `GET /api/admin/settings` and `GET /api/admin/audit`. USER and invalid/revoked/unavailable Identity are rejected before a detailed projection is read. The local App member must remain active. Actor and authority are constructed server-side; request-body role/actor fields cannot elevate authority.

| Route | Methods | Mutation authority |
| --- | --- | --- |
| `/api/admin/settings/lookups/{kind}[/{id}]` | POST / PATCH | SUPER_ADMIN |
| `/api/admin/settings/worklog-categories[/{id}]` | POST / PATCH | ADMIN / SUPER_ADMIN |
| `/api/admin/settings/worklog-platforms[/{id}]` | POST / PATCH | ADMIN / SUPER_ADMIN |
| `/api/admin/settings/worklog-scoring-rows` | PUT | ADMIN / SUPER_ADMIN |
| `/api/admin/settings/worklog-scoring-config` | PUT | ADMIN / SUPER_ADMIN |
| `/api/admin/settings/app-tags[/{id}]` | POST / PATCH | SUPER_ADMIN; metadata only |

Lookup kind is one of department/customer_category/customer_status/item_category. Existing SettingsService validation, `expectedUpdatedAt` / `expectedRevision`, deactivation and shared Audit semantics remain authoritative. The UI exposes structural, WorkLog and scoring maintenance, and reads historical App-tag metadata; Module Access stays in account management.

Detailed Audit accepts bounded `limit` 1–200 and optional entityType/entityKey/action/actorEmployeeId/occurredFrom/occurredTo. Codes, IDs and time ranges are validated before querying the single existing AuditService. Writes, user-scoped bypasses and browser-local audit lists are not provided.

## Program catalog HTTP transport

`GET /api/programs` requires only a provider-resolved valid CYID Session. USER, ADMIN and SUPER_ADMIN may read it without business Module Access or local D1 membership checks. Invalid Session returns 401; unavailable Identity returns 503; other methods return 405 after authentication. The route neither writes D1 nor grants application access.

The usual success envelope contains `programs`, `checkedAt` and `current`. Entries contain ID/name/platform/icon/description, nullable version/publishedAt/releaseUrl/downloadUrl/websiteUrl. Unreleased entries keep all release/link fields null. `current=false` identifies the last verified public snapshot when bounded live GitHub lookups fail; callers must label its versions as confirmed rather than latest. A newest formal desktop release without a verified compiled ZIP has a null download URL. Only fixed public CYapps release families and exact known assets are accepted; external metadata cannot supply arbitrary links.

## Backup management HTTP transport

SUPER_ADMIN with a provider-resolved current Session and active app membership may use:

| Route | Method | Result |
| --- | --- | --- |
| `/api/admin/backups` | GET | Latest 50 logical backup events with nested R2/GCS copy status and server-derived retry eligibility |
| `/api/admin/backups` | POST | Create one manual event requesting both providers; return current history and the backup ID |
| `/api/admin/backups/{backupId}/retry` | POST | Retry a requested pending/failed GCS copy from existing verified R2 bytes; return current history |

The shared `BackupHistory` projection exposes IDs/time/version/counts/digest/status only, excluding storage resource identifiers, credentials and object prefixes. `configured=false` still permits scoped history reads and disables mutations; mutations fail with `BACKUP_NOT_CONFIGURED`. Workspace and actor are resolved server-side, never from request bodies. An HTTP success returns the resulting catalog state and does not assert that both provider copies succeeded. Clients display per-provider outcomes and do not automatically repeat a failed/ambiguous mutation.

Recovery rehearsal remains an internal operator/test primitive. It validates selected immutable bytes with R2 preference/GCS fallback and catalog agreement, checks the isolated target is empty/schema-compatible, requires actor/authority and two explicit selection/target acknowledgements, then creates and verifies a separate both-provider pre-restore safety set before target writes. Reconciliation and structured source Audit are required. No public restore/delete/download/upload endpoint is exposed. Internal authority inputs are trusted caller context; this is not evidence of deployed Identity-backed live restore authorization or a completed destructive restore UI.
