# CY Web Customer Service Foundation

> Status: domain/repository foundation staged before protected route wiring.

## 1. Purpose

This layer converts the approved Customer module contract into reusable Worker-side Customer domain behavior without exposing an unauthenticated production API.

It separates:

- request/domain normalization;
- Customer business validation;
- D1 query/repository behavior;
- route authentication/authorization, which remains a later layer.

The browser must never be treated as authoritative for Customer validation.

## 2. Current service surface

The staged service provides:

- bounded server-side Customer search;
- Customer detail loading;
- duplicate Tax ID inspection;
- create preflight validation;
- update preflight validation;
- reference lookup validation;
- optimistic revision checks;
- Customer-number conflict/control checks;
- child-row ownership validation.

Actual create/update persistence and protected HTTP route exposure are intentionally separate from this foundation.

## 3. Search contract

Customer search queries D1 on demand. It does not load a complete Customer dataset into browser-global state.

Supported bounded filters align with the shared contract:

- keyword;
- category;
- status;
- region;
- owner department;
- owner employee;
- bounded limit;
- opaque cursor.

Keyword search currently covers Customer number, short name, full name and Tax ID. Additional cross-field search should be added only when real workflow usage proves it is needed.

## 4. Customer detail aggregate

The detail repository returns the Customer master plus bounded owned profile rows:

- phones;
- contacts;
- addresses;
- important notes.

Visits, Frequent Items and Quote history remain separate on-demand resources. They are not pulled into every Customer detail request.

## 5. Duplicate Tax ID

Tax ID is indexed but deliberately non-unique.

When another Customer already uses the same non-empty Tax ID:

- the service returns/raises `DUPLICATE_TAX_ID_CONFIRM_REQUIRED` unless explicit acknowledgement is supplied;
- matching Customer summaries can be shown to the user;
- explicit acknowledgement allows the operation to continue;
- the Worker remains authoritative even if the client already displayed a warning.

## 6. Customer number

`customer_no` is unique when present, but Customer identity is the immutable internal Customer ID.

Ordinary profile update does not silently assign/correct/change an existing Customer number. If the submitted value differs from the current value, the service requires the future controlled Customer-number action.

This preserves BD-048 semantics and keeps future SMART ERP ownership/integration behavior separable from ordinary Customer editing.

## 7. Optimistic concurrency

Update preflight requires `expectedRevision`.

If the persisted revision no longer matches, the service returns `CUSTOMER_REVISION_CONFLICT` instead of silently overwriting newer data.

The final persistence implementation must increment `revision` only after a successful mutation.

## 8. Reference validation

Nullable lookup references are accepted only when they resolve to active rows where applicable:

- Customer category;
- Customer status;
- region;
- owner department;
- owner employee/app member.

Invalid or inactive references are mapped to field validation errors.

## 9. Owned child-row protection

Update payloads may contain existing child IDs for phones, contacts, addresses and notes.

Before later persistence is allowed, every supplied child ID must already belong to the Customer being updated. A client cannot move or overwrite another Customer's child row merely by submitting its ID.

Create payloads cannot supply existing child IDs.

## 10. Shared Identity boundary

This foundation deliberately does not resolve browser login/session itself.

Later protected routes must:

1. resolve the Shared Identity principal;
2. enforce CY Web Customer module access;
3. resolve the local app member projection;
4. call CustomerService;
5. use the local actor ID for mutation metadata/audit where required.

No passwords, credential verifiers, OTPs or CYInvoice-specific credential logic belong in CustomerService.

## 11. Audit boundary

Ordinary Customer profile edits follow BD-053 and retain latest modifier/time/revision rather than generating unlimited field-by-field audit history.

Meaningful controlled actions, such as a future Customer-number assignment/correction operation, may create Audit Core events when that action is implemented.

## 12. Runtime gate

This foundation does not by itself:

- expose Customer mutation routes;
- write production D1;
- bypass Shared Identity;
- change production Worker/DNS/R2/GCS bindings;
- modify CYAccountingWeb or CYInvoice runtime.

Protected Customer persistence/routes remain gated by Shared Identity browser-session wiring and local/dev Worker + D1 acceptance.