# CY Web Customer Edit Interaction — Preview Contract

> Status: static interaction preview before protected Customer API wiring.
>
> This document records how the first Customer create/edit surface consumes the shared CY Web interaction foundation. It does not authorize production Customer writes and does not freeze final visual styling.

## 1. Purpose

The Customer module is the first real consumer of the shared record-editing foundation.

The preview must prove that Customer does not recreate page-local versions of:

- create/view/edit/cancel state;
- dirty tracking and unsaved-change protection;
- repeated-row editing;
- common field validation presentation;
- confirmation dialogs;
- non-blocking success feedback;
- keyboard data-entry progression.

Customer supplies Customer-specific fields and business rules only.

## 2. Record lifecycle

The preview consumes the shared `record-editor` state machine:

- `view` — readable Customer detail, not a disabled-input form;
- `create` — new Customer draft;
- `edit` — editable working copy of an existing Customer;
- `cancel` — restore the loaded baseline or return from create mode;
- `save` — preview-only local commit now; later protected API mutation.

Switching Customer, starting a new Customer, or cancelling with dirty data must pass through the common unsaved-change confirmation pattern.

Browser close/reload protection uses the shared `useUnsavedChangesGuard` behavior.

## 3. Repeated profile rows

Phones, contacts, addresses and important notes use the shared editable-list reducer rather than private Customer-only list state machines.

The shared list layer owns:

- stable row key;
- add;
- update;
- remove;
- dirty state;
- reset to baseline;
- commit baseline after save;
- serialization.

Customer owns the row field definitions and domain validation.

## 4. Form and keyboard behavior

The edit surface uses shared field primitives:

- `TextInput`;
- `SelectField`;
- `TextArea`.

High-frequency single-line inputs may opt into shared Enter-to-next-field progression. Text areas and select controls keep their native/component keyboard semantics.

Field validation is inline. Routine validation errors must not use blocking alerts.

## 5. Customer number boundary

`customerNo` remains conceptually SMART ERP-owned even though live ERP synchronization is deferred.

The preview therefore distinguishes two cases:

- while creating a new preview Customer, the optional field may be entered so both numbered and not-yet-numbered Customer states can be reviewed;
- once an existing Customer is loaded, the number is not treated as an ordinary profile-edit field.

Assignment/correction/change of an existing Customer number is a meaningful controlled action and must later use the protected server workflow plus shared Audit Core. The normal edit surface must not silently overwrite it.

A duplicate non-empty Customer number is a hard conflict. The preview blocks an obvious duplicate in its static dataset; production D1 uniqueness and Worker validation remain authoritative.

## 6. Duplicate Tax ID preview

The confirmed Customer contract allows duplicate Tax ID but requires strong warning and explicit acknowledgement.

The interaction preview therefore:

1. validates an entered Tax ID shape;
2. checks the local static preview dataset for another matching Customer;
3. presents the common confirmation Dialog when a duplicate is found;
4. allows the save only after explicit confirmation.

The production implementation will perform the authoritative check in the Worker/D1 service and use `DUPLICATE_TAX_ID_CONFIRM_REQUIRED`; client-side detection is not authoritative.

## 7. Save feedback

Preview save writes only to in-memory/static browser state so the complete interaction can be reviewed before Identity/runtime wiring.

Success uses the shared Toast region. The preview must clearly state that no production D1 write occurred.

When protected API wiring is later available:

- create becomes `POST /api/customers`;
- edit becomes `PATCH /api/customers/:customerId` with `expectedRevision`;
- server response replaces the preview-only local mutation;
- conflict, authorization and domain validation remain authoritative on the server.

## 8. Customer selection during edit

Desktop search stays visible beside Customer detail. This creates an important interaction rule:

- clean view → selecting another Customer switches immediately;
- dirty create/edit → selecting another Customer first asks whether to discard changes;
- selecting a new Customer must never silently destroy unsaved data.

Search state remains independent from Customer record state.

## 9. Delete boundary

Hard delete is intentionally not added to this interaction preview merely because Legacy had a Delete button.

The final Customer UI may expose hard delete only after the protected server dependency check confirms the Customer has never become a referenced business entity. Client state alone can never infer this safely.

## 10. Production/runtime boundary

This preview does not:

- expose an unauthenticated Customer mutation route;
- bypass Shared Identity;
- write production D1;
- bind production Worker/D1/R2/GCS/DNS resources;
- copy CYInvoice credential logic;
- modify CYAccountingWeb or CYInvoice runtime.

Protected Customer CRUD still waits for the Shared Identity browser-session provider and local/dev Worker + D1 acceptance.

## 11. Visual status

The interaction is implemented inside the current Desktop-first Customer composition so usability can be reviewed with realistic state transitions.

The following remain provisional:

- final colors/branding;
- exact field density;
- exact Desktop split ratio;
- final Tablet/Mobile edit presentation;
- final action placement after browser review.

The governing product direction remains BD-055: useful Legacy workflow may be retained/adapted, while implementation and UI follow the new shared Web architecture rather than reproducing GAS.
