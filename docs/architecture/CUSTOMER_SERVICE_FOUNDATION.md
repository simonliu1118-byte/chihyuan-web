# CY Web Customer Service Foundation

> Status: domain/repository/persistence foundation staged before protected route wiring.

## 1. Purpose

This layer converts the approved Customer module contract into reusable Worker-side Customer domain behavior without exposing an unauthenticated production API.

It separates:

- request/domain normalization;
- Customer business validation;
- D1 query/repository behavior;
- D1 persistence behavior;
- route authentication/authorization, which remains a later layer.

The browser must never be treated as authoritative for Customer validation.

## 2. Current service surface

The staged service provides:

- bounded server-side Customer search;
- Customer detail loading;
- duplicate Tax ID inspection;
- create/update preflight validation;
- reference lookup validation;
- optimistic revision checks;
- Customer-number conflict/control checks;
- child-row ownership validation;
- transactional Customer profile create/update persistence behind a mutation context.

Protected HTTP route exposure is intentionally separate from this foundation.

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

The D1 partial unique index remains authoritative if two create requests race after preflight.

This preserves BD-048 semantics and keeps future SMART ERP ownership/integration behavior separable from ordinary Customer editing.

## 7. Optimistic concurrency and persistence

Update requires `expectedRevision`.

Customer profile writes use a dedicated persistence boundary and D1 `batch()` transactions. Owned child writes are revision-gated and execute before the final Customer master revision increment within the same transaction.

If the submitted revision is stale, the child statements do not mutate rows and the final master update changes zero rows; the service returns `CUSTOMER_REVISION_CONFLICT` instead of silently overwriting newer data.

A successful update increments `customers.revision` exactly once and records the authenticated local app-member actor/time supplied by the later route layer.

Create writes the Customer plus owned phones/contacts/addresses/notes in one D1 batch transaction.

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

Before persistence is allowed, every supplied child ID must already belong to the Customer being updated. A client cannot move or overwrite another Customer's child row merely by submitting its ID.

Create payloads cannot supply existing child IDs.

Visit-referenced Customer Contacts have an additional retention rule: removing them from the active Customer profile deactivates them rather than deleting the referenced Contact row. Unreferenced omitted contacts may be deleted normally.

## 10. Shared Identity boundary

This foundation deliberately does not resolve browser login/session itself.

Later protected routes must:

1. resolve the Shared Identity principal;
2. enforce CY Web Customer module access;
3. resolve the local app member projection;
4. call CustomerService with that local actor ID;
5. map domain errors into the shared API envelope.

No passwords, credential verifiers, OTPs or CYInvoice-specific credential logic belong in CustomerService.

## 11. Audit boundary

Ordinary Customer profile edits follow BD-053 and retain latest modifier/time/revision rather than generating unlimited field-by-field audit history.

Meaningful controlled actions, such as a future Customer-number assignment/correction operation, may create Audit Core events when that action is implemented.

Related Quote correction remains separate because BD-022 explicitly requires audit semantics; see `CUSTOMER_RELATED_FOUNDATION.md`.

## 12. Runtime gate

This foundation does not by itself:

- expose Customer mutation routes;
- bypass Shared Identity;
- bind or write production D1;
- change production Worker/DNS/R2/GCS bindings;
- modify CYAccountingWeb or CYInvoice runtime.

Protected Customer routes remain gated by Shared Identity browser-session wiring and local/dev Worker + D1 acceptance.
