# CY Web Sales Work Order Module Contract

Status: active Sales Work Order domain/runtime contract; protected HTTP API and React Worker/D1 transport are implemented in development.

This contract follows the confirmed Sales Work Order decisions, especially BD-024, BD-029, BD-031, BD-034 and BD-035. Legacy Desktop is behavior evidence only; the new Worker/D1 domain service is authoritative.

## Purpose and system boundary

CY Web owns a field/pre-ERP Sales Work Order used to capture customer/order requirements and continue the operational fulfillment workflow. SMART ERP remains authoritative for the formal sales-order document and official ERP document number.

CY Web must never treat `sales_work_orders.id` or `work_order_ref` as the SMART ERP sales-order identity.

## Customer modes while status is `created`

A draft work order supports exactly two customer-entry modes.

### Linked Customer

- `customer_id` is present.
- Customer name and current Customer number are derived server-side from the selected Customer.
- The selected Customer may legitimately have `customer_no = NULL` before ERP qualification.
- The browser does not persist an arbitrary number/name combination.

### Name-only field entry

- `customer_id = NULL`.
- `customer_no_snapshot = NULL`.
- `customer_name_snapshot` is required free text.
- CY Web does not fuzzy-match, auto-link or silently merge this name to a Customer master.

Closed-business status is informational and does not by itself block the workflow (BD-035).

## Line-item rule

Initial Sales Work Order lines require formal Item selection.

Each input line carries only the selected `itemId`, quantity, chosen unit, unit price and optional note. The Worker resolves and freezes current Item number/name/spec snapshots. Free-text/unfiled order lines are not part of the initial contract.

Quantity and unit price use exact scaled4 storage; browser/API decimal strings are parsed by the shared fixed-point helpers.

## Editable boundary

Ordinary commercial editing is allowed only while the work order is still `created` and has no ERP sales-order number.

Editable draft content includes customer mode/selection, order date, operator, note, document flags and line items.

After ERP handoff, ordinary commercial fields are locked. Later changes to ERP references or workflow state use explicit domain actions rather than general edit.

## ERP fill / correction

One contextual business capability is used:

```text
ERP relationship incomplete  -> 回填 ERP 資料
ERP relationship complete    -> 更正 ERP 資料
```

Input includes:

- exact ERP Customer number; and
- SMART ERP sales-order number.

The ERP Customer number must resolve exactly to an existing Customer master row whose `customer_no` matches. The Worker then supplies the canonical `customer_id`, Customer number snapshot and Customer name snapshot. No fuzzy inference or free-entered number/name pair is accepted.

First successful ERP fill from `created` changes status to `issued`. A later correction keeps the existing fulfillment status (`issued`, `waiting_stock`, `picked` or `shipped`) while replacing only the corrected ERP/customer relationship values.

ERP correction is a meaningful business action and records compact before/after structured Audit in the same D1 batch as the mutation.

A voided work order is terminal and does not accept ERP correction.

## Fulfillment lifecycle

Canonical codes:

```text
created
  -> issued                    first ERP fill
issued
  -> waiting_stock             optional
  -> picked                    direct pick is allowed
waiting_stock
  -> picked
picked
  -> shipped
shipped
  -> picked                    explicit shipment reversal only

issued / waiting_stock / picked / shipped
  -> voided                    explicit void action
```

The service does not expose a generic `setStatus()` operation. Each meaningful transition has an explicit action and server-side source-state check.

Shipment reversal is a controlled correction action and requires the caller context to carry the explicit permission resolved by the application authorization layer. It records structured Audit.

## Delete versus void

Hard delete is permitted only when all are true:

- status is `created`;
- no ERP sales-order number is present; and
- caller authorization permits the delete.

After ERP issuance or later fulfillment, hard delete is prohibited. The supported terminal business action is `void`, which preserves the work order, ERP references and prior business facts.

The exact role/tag-to-permission mapping remains outside this domain contract; the service consumes already-resolved authorization capability flags.

## Snapshot behavior

Sales Work Order is a formal operational record, so it freezes deliberate snapshots:

- Customer number/name snapshot;
- Item number/name/spec snapshots;
- line unit and unit-price input.

Later Customer or Item master edits do not rewrite existing work-order snapshots.

## Search / reads

List/search is server-side and bounded. Search may match:

- `work_order_ref`;
- `erp_no`;
- Customer number/name snapshot.

Filters may include status, order-date range, operator and linked Customer. Detail reads load the master plus only that order's line items.

No whole Order module dataset is loaded into browser-global memory as in GAS.

## Audit boundary

Ordinary draft edits follow BD-053 and keep only latest modification metadata/revision.

The following actions create structured shared-Audit events:

- first ERP fill;
- ERP correction;
- `issued -> waiting_stock`;
- `issued/waiting_stock -> picked`;
- `picked -> shipped`;
- shipment reversal `shipped -> picked`;
- void;
- hard delete of an eligible draft.

Audit payloads remain compact. They do not duplicate whole row/line snapshots unless a future explicit requirement justifies it.

## Concurrency

All mutations require `expectedRevision` where a record already exists. Worker-side optimistic concurrency is authoritative.

Meaningful state/reference actions use one D1 batch for the domain update plus Audit insert so the event is not recorded if the guarded mutation did not occur. ERP fill/correction and status Audit require `changes() = 1` from their immediately preceding master UPDATE, as well as the expected resulting revision/state. A captured stale request produces no event even if another request already reached the same resulting state.

## Reference generation

`work_order_ref` is a user-facing/system reference and remains distinct from the internal D1 `id` and SMART ERP `erp_no`.

The exact production formatting rule for newly generated `work_order_ref` remains an explicitly deferred presentation/reference-format decision in the Final Data Dictionary. The domain service therefore receives a generated reference through an injected/reference-provider boundary instead of hard-coding a format in Public source.

## Runtime boundary

Sales Work Order now uses the protected same-origin Worker API in the integrated React application.

Runtime rules:

- every Order request resolves the current CYID Session and requires current `ORDERS` Module Access before lookup or domain-service access;
- Customer / Item / operator picker data comes from bounded `/api/business/orders/lookups` projections under that same `ORDERS` authority and does not depend on browser-local Customer/Item data;
- mutation actor, draft-delete authority and shipment-reversal authority are derived server-side from the current principal;
- the React route uses current D1 `revision` for draft update, ERP fill/correction, lifecycle actions and delete;
- React does not fall back to browser-local Order writes when the API fails;
- development writes target development Worker/D1 only; production cutover remains a separate explicitly approved operation.

Production D1, Worker bindings, DNS and backup resources are not modified by this development transport cutover.