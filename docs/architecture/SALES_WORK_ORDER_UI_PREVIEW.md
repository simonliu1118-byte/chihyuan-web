# Sales Work Order Functional Preview

Status: browser-local functional review surface; not production UI acceptance.

`preview/sales-work-order/full-workspace-v1.html` integrates the confirmed Sales Work Order behavior into one testable screen before protected HTTP wiring and before detailed visual polish.

## Included functional paths

- left Search Pane + right Detail Pane;
- search by work-order reference, ERP number or Customer snapshot;
- status filter;
- create a new `created` work order;
- linked-Customer mode;
- explicit name-only field-entry mode with no auto-linking;
- one or more formal Item lines;
- exact-looking decimal input constraints matching the service's four-decimal boundary;
- Item unit choices based on the preview Item's allowed units;
- draft edit only while status is `created` and ERP number is absent;
- top and bottom Cancel/Save controls for long edit forms;
- ERP fill and correction from one contextual operation;
- exact Customer-number matching in the ERP dialog;
- first ERP fill moves `created -> issued`;
- later ERP correction keeps the current fulfillment state;
- `issued -> waiting_stock`;
- `issued/waiting_stock -> picked`;
- `picked -> shipped`;
- explicit `shipped -> picked` shipment reversal;
- void from any ERP-issued active fulfillment state;
- hard delete only for an unissued `created` preview record;
- browser-local important-action history illustrating the shared Audit semantics.

## Deliberate preview-only behavior

- all records are fictional and kept only in browser memory;
- reload restores the initial sample dataset;
- preview work-order references such as `PREVIEW-WO-001` are not a production numbering decision;
- browser `confirm()` / `prompt()` may be used for fast workflow testing and do not freeze final overlay UX;
- permission flags are represented by available preview actions; real authority remains server-side through Shared Identity/app authorization;
- no D1, Worker business route, Identity session, SMART ERP connection, DNS or production resource is touched.

## Review priority

Current priority is functional correctness and workflow completeness. Detailed spacing, button placement, visual hierarchy, responsive fine-tuning and final CY branding remain later UI review items.

The accepted Customer readability baseline carries forward: normal business text should remain approximately 14–16px and form controls approximately 15px rather than reverting to dense Legacy/GAS-sized text.