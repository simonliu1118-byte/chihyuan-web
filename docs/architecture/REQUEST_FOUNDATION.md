# CY Web Request / Validation Foundation

> Status: initial shared application foundation before the first authenticated business API.

## Purpose

CY Web business modules must not each invent their own browser fetch wrapper, Worker response envelope, JSON parsing, field-validation presentation contract, or generic request error mapping.

This foundation implements the common mechanics once while leaving domain validation and authorization in the applicable business module.

## Browser side

`src/api/client.ts` provides one shared `apiRequest<T>()` path for same-origin `/api/*` calls.

It owns:

- expected API envelope parsing;
- stable `ApiClientError` with HTTP status, application error code, request ID and optional field errors;
- JSON request serialization;
- `Accept: application/json`;
- same-origin credentials;
- `cache: no-store` for dynamic API requests;
- invalid/non-JSON response handling.

It does **not** automatically retry mutations. Business actions must not be duplicated by a generic retry policy.

`src/api/request-state.ts` defines a small shared `idle/loading/success/error` request state model so pages do not create incompatible loading/error conventions for the same mechanics.

## Worker side

`worker/http/response.ts` owns the shared JSON success/failure envelope and required dynamic-response headers.

`worker/http/request.ts` provides bounded JSON-object parsing and rejects:

- unsupported request content type;
- oversized payloads;
- invalid JSON;
- non-object top-level request shapes.

The initial generic JSON-body limit is 64 KiB. Larger domain payloads require an explicit later design rather than silently increasing the generic limit.

`worker/validation/fields.ts` provides small common field validators and a field-error accumulator. These helpers cover mechanics such as required text, bounded text, positive integer, boolean and ISO calendar date validation.

Domain-specific rules remain in domain code. Examples that must **not** be moved into generic validation include:

- Customer business rules;
- Sales Work Order lifecycle validation;
- WorkLog scoring/review rules;
- Outsourcing stock/receiving/pricing/payment rules;
- Defect workflow rules.

`worker/http/errors.ts` maps generic request/field-validation failures to the canonical API error envelope. Unexpected internal errors return a generic safe message and do not leak internal details.

## Field validation contract

When field-specific feedback is useful, the Worker may return:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {
      "shortName": "必填"
    }
  },
  "requestId": "..."
}
```

The frontend uses the stable field keys to present inline validation through shared form components later.

## Relationship to UI foundation

This request layer is intentionally independent from the final visual design.

The future shared form/data-view components consume this common request/error model, so Customer, Item, Order and other screens can present consistent loading, validation, conflict and retry UX without each implementing networking mechanics again.

## Current limit

This branch still does not provide the first protected business endpoint because the production Shared Identity browser-session provider contract remains an external dependency.

The next authenticated business slice should reuse:

- `apiRequest<T>()`;
- shared response helpers;
- bounded JSON parsing;
- shared validation bag;
- Identity/module-access guards;
- Audit Core where the action is audit-worthy.
