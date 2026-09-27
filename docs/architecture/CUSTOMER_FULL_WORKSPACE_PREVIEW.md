# CY Web Customer Full Workspace Preview

> Status: integrated browser-local functional review gate before protected API wiring.

## Purpose

The Customer workstream previously reviewed the master record and the related-record interactions separately. This stage combines them into one Customer workspace so the workflow can be tested as a whole before further visual polish.

Current priority is **functional completeness first, UI refinement second**, with two usability requirements promoted into the baseline: readable business text and save/cancel access at both the top and bottom of long edit forms.

## Integrated preview scope

The standalone previews under `preview/customer/` include one in-memory Customer workflow:

- Customer search and filter;
- Customer selection;
- Customer create/edit;
- duplicate Tax-ID confirmation;
- repeated phones, contacts, addresses and important notes;
- Customer related tabs embedded in the same Detail Pane;
- Visit create/edit/delete;
- Visit-time person snapshot behavior;
- Quote history create;
- Quote correction as a separate action from a new commercial price;
- repeated Quote price breaks;
- Frequent Item edit;
- explicit formal Item vs free-text identity;
- basic unsaved Customer edit protection;
- browser-memory-only preview persistence.

`full-workspace-v2-readable.html` is the current review target. It raises the readability baseline and keeps `取消` / `儲存` available in both the upper edit header and the lower form action area.

The independent related-record review page remains development scaffolding only. It is not a production menu/page concept.

## Production semantics preserved

The preview intentionally follows the already-staged domain contracts:

- Customer internal identity is separate from ERP Customer number;
- existing Customer number is not casually overwritten in ordinary edit;
- duplicate Tax ID is allowed only after a strong explicit warning;
- Visit person is historical snapshot text even when linked to a current Contact;
- new commercial Quote terms create a new history record;
- factual correction of an existing Quote is a separate operation;
- no casual Quote hard-delete action is introduced;
- Frequent Item free text never auto-links by name to a formal Item.

## Readability baseline

The first full-workspace preview used too much 10–12px text and was difficult to read on a normal Desktop display. That is now treated as a usability defect rather than deferred visual polish.

The current direction is:

- normal business content: roughly 14–16px depending on hierarchy;
- field values / form controls: approximately 15px;
- secondary metadata: generally 13px;
- 10–12px reserved only for truly minor supporting information where readability remains acceptable.

The React foundation also loads the same readability direction through a shared override layer rather than fixing Customer only.

## Edit-action accessibility

Customer create/edit is a long form. Therefore:

- the upper Customer header action area exposes `取消` and `儲存` immediately after entering edit/create mode;
- the same actions are repeated after the final form section;
- both action sets use the same save/cancel semantics, validation and unsaved-change protection.

This avoids forcing a user who changes only an upper field to scroll to the bottom, while still supporting users already working near the end of the form.

## Customer lifecycle action note

BD-030 already defines the deletion boundary:

- a Customer may be hard-deleted only when it has no retained business/history references;
- referenced Customers remain because identity/history must be preserved;
- `已歇業` is a business status, not deletion;
- if a separate inactive/archive mechanism is later introduced, it is distinct from `已歇業` and hard delete.

Therefore the final Customer header must not show a universally enabled `刪除` button. The server must determine whether hard delete is currently eligible. UI placement/presentation is intentionally left in the later visual-polish backlog.

## Runtime boundary

This integrated preview is not a production implementation:

- data is fictional and browser-local;
- reload resets the preview;
- no protected Customer HTTP route is exposed;
- no production D1 write occurs;
- Shared Identity is not bypassed;
- production Worker / DNS / R2 / GCS resources are not modified.

The real protected implementation still requires the established Shared Identity browser-session and local/dev Worker+D1 acceptance gates.
