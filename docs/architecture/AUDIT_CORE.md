# CY Web Audit Core — Initial Implementation Contract

> Status: implementation foundation for BD-053 / BD-054.

## 1. Scope

CY Web uses one in-App `AuditService` for meaningful business/domain events. Individual modules must not create separate audit tables, write formats or query stores.

This contract is scoped to CY Web only. It does not require CYInvoice, CYAccountingWeb or other separately developed Apps to share this implementation.

## 2. What creates Audit

Ordinary CRUD does not create an audit row on every save. Normal records keep their latest `updated_at` / `updated_by` / `revision` metadata.

Structured Audit is for meaningful actions such as:

- Sales Work Order ERP-number fill/correction, issue, pick, ship, void and controlled reversal;
- Outsourcing outbound, receipt, pricing, payment and correction/reversal;
- WorkLog submit, withdraw, review and cancel-review;
- Defect status changes and reopen;
- access/permission configuration changes;
- important Settings/scoring/configuration changes;
- backup/restore high-risk actions.

## 3. One event, two presentations

The same `audit_events` row supports:

1. concise timeline/history on a normal business record screen; and
2. detailed Admin / Super Admin Audit Log inspection.

The concise timeline reads only the small operational fields needed for display. It does not read or expose raw before/after/metadata payloads.

Detailed payloads are only for the restricted Audit Log path.

## 4. Event contract

Required:

```text
entity_type
entity_key
action
occurred_at
```

Normally also present:

```text
actor_employee_id
request_id
```

Optional when useful:

```text
status_from
status_to
before_json
after_json
metadata_json
```

`entity_type` and `action` are normalized stable lower-case codes. `entity_key` is the stable business record reference/key needed to locate that event history.

## 5. Cost controls

Audit is not a shadow copy of the business database.

The initial `AuditService` applies these technical safeguards:

- no event for routine field edits unless the domain action itself is meaningful;
- no full-row snapshot requirement;
- before/after/metadata are optional;
- each JSON payload is capped at 8 KiB;
- combined before/after/metadata is capped at 16 KiB per event;
- oversize payloads are rejected rather than silently truncated;
- attachments, PDFs, images and binary data do not belong in Audit payloads;
- timeline and detailed log reuse the same stored event;
- list queries have bounded limits.

The size limits are implementation safeguards, not a future retention policy. They can be revised by a later engineering change if real production evidence shows a justified need.

## 6. Secret rejection

Audit payload object keys that indicate credentials/secrets are rejected by the shared service, including password, token, credential, secret, API-key and authorization-like fields.

This is an additional safety guard. Business modules remain responsible for passing only the minimum non-sensitive audit facts.

Never put plaintext passwords, session tokens, provider credentials, recovery secrets or equivalent material into Audit.

## 7. Actor identity

`actor_employee_id` references the CY Web `app_members` projection, which in turn links to stable Shared Identity employee identity.

The Audit Core does not copy passwords or Shared Identity credential material.

Normal timeline projection may join the current employee number for a concise display. If a later UI needs richer actor-name display, that should be resolved through the approved Identity/application presentation layer rather than duplicating credential authority in Audit.

## 8. Query boundaries

### Timeline

`listTimeline(entityType, entityKey)`:

- bounded result count;
- action;
- actor reference / current employee number when available;
- timestamp;
- status transition.

It intentionally omits `before_json`, `after_json`, `metadata_json` and request/correlation internals.

### Detailed Audit Log

`listDetailed(query)` supports bounded filtering by:

- entity type;
- entity key;
- action;
- actor;
- occurrence range.

The calling API must enforce Admin / Super Admin authorization before exposing this detailed projection.

## 9. Retention

The Audit Core is designed so a retention/pruning operation can be added later, but no arbitrary production retention period is set now.

A future policy must be based on observed event volume, D1 growth, backup-size impact and operational investigation needs, while respecting any Business Decision that explicitly requires particular evidence to remain available.

## 10. Current implementation boundary

Current source:

```text
worker/audit/audit-service.ts
```

The service is intentionally not yet exposed as a public API route. API wiring follows after Shared Identity/session authorization can protect the detailed Audit Log and after the first domain service begins recording confirmed business actions.
