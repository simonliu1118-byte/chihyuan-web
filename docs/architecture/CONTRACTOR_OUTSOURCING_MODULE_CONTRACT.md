# CY Web Contractor / BOM / Outsourcing Module Contract

> Status: active Contractor / BOM / Outsourcing domain/runtime contract; protected HTTP API and React Worker/D1 transport are implemented in development.
>
> Legacy GAS is workflow evidence only. Stock timing and correction behavior follow the confirmed CY Web Business Decisions rather than Legacy mutable-balance shortcuts.

## 1. Scope

This slice covers:

- Contractor master and contacts;
- one current Contractor Price per Contractor + Item;
- multiple BOM variants per finished Item;
- Outsourcing order planning;
- confirmed material outbound;
- receiving with explicit BOM selection when multiple BOMs apply;
- contractor-stock movement ledger;
- pricing and payment;
- controlled reversal/correction paths.

Protected same-origin Worker routes now expose this domain in development behind current CYID Session + `OUTSOURCING` Module Access. Production cutover remains separate and explicitly approved.

## 2. Contractor

A Contractor is identified by immutable `contractors.id`; name is display data, never a foreign key.

`entity_type` supports `person` and `organization`.

Referenced Contractors are retained. A Contractor that has participated in any Outsourcing order cannot be hard-deleted; it may be deactivated. Never-used Contractor hard delete remains an explicitly authorized action.

Ordinary Contractor profile edits keep latest-modified metadata. They do not create unbounded field-by-field history.

## 3. Contractor Price

Per BD-038 there is exactly one current price for:

```text
Contractor + Item
```

The current row contains:

- pricing unit;
- scaled4 unit price;
- optional note;
- revision.

The pricing unit must be a valid Item unit according to the canonical Item conversion graph.

Changing a current Contractor Price is a meaningful business event and records structured shared Audit before/after values. Historical Outsourcing pricing snapshots never change when the current Contractor Price later changes.

## 4. BOM

Multiple active/inactive BOM variants may point to the same finished Item.

A BOM contains:

- stable technical ID;
- display/system `recipe_ref`;
- finished Item;
- output quantity + output unit;
- component Item rows with quantity + unit;
- active state and revision.

BOM units must be valid units of their Items.

`recipe_ref` is not an ERP Item number and its final production formatting remains a server/provider concern before protected API rollout; the browser UI must not imply that users are managing technical database IDs.

## 5. Outsourcing lifecycle

Canonical states:

```text
pending_outbound
      ↓ confirm outbound
outbound
      ↓ receive
received
      ↓ price
priced
      ↓ pay
paid
```

`voided` is terminal after a confirmed outbound is cancelled.

A newly created `pending_outbound` record is only a plan. It does **not** change contractor-held stock.

## 6. Outbound and stock ledger

Confirming outbound is the first physical stock event.

Each planned component quantity is converted exactly to the Item base unit and written as a positive `outbound_supply` movement in `contractor_stock_movements`.

The ledger is authoritative. There is no separately authoritative mutable Contractor stock balance.

Current balance is derived as:

```text
SUM(contractor_stock_movements.quantity_delta)
by Contractor + Item
```

## 7. Confirmed-outbound correction

After confirmation, contractor/material/quantity/unit facts are no longer ordinary editable fields.

Before receiving, an authorized **更正出庫** action may replace incorrect outbound facts while keeping the order active in `outbound`:

1. preserve the original movements;
2. create linked reversal movements for the currently active outbound movements;
3. replace the corrected order-part snapshot;
4. create new outbound movements for the corrected facts;
5. record structured shared Audit before/after context.

The original physical/event history is never rewritten away.

## 8. Cancel outbound

**取消出庫** is available only after downstream receiving/pricing/payment effects have first been reversed.

Cancellation:

- creates linked reversal movements for active outbound supply;
- records shared Audit;
- terminates the Outsourcing order as `voided`;
- does not return the same order to `pending_outbound`.

A new job after cancellation is a new Outsourcing order.

## 9. Receiving and BOM choice

Initial scope supports one active completed receiving record per Outsourcing order; partial/multiple concurrent receipt events are not silently introduced.

For each received finished Item:

- zero active applicable BOMs: the receipt may remain without a BOM and creates no component-consumption movement for that line;
- exactly one active BOM: the service may select it directly;
- multiple active BOMs: the caller must explicitly identify the BOM actually used;
- an explicitly supplied BOM must belong to that finished Item and be active.

When a BOM is selected, the received quantity is converted to the BOM output unit and the component consumption is derived from the selected BOM. Consumption is then converted to each component Item base unit and recorded as negative `receipt_consumption` movements.

All quantity conversions are exact to the canonical scaled4 precision. The service does not silently round a quantity that cannot be represented at that precision.

## 10. Cancel receiving

Receiving cancellation is a controlled reverse operation and requires the order to be in `received` state. Pricing/payment must first be reversed.

The service:

- records the cancelled receiving facts in shared Audit;
- creates linked reversal movements for active `receipt_consumption` movements;
- removes the current active receipt projection;
- returns the order to `outbound`.

The physical/history fact remains traceable through Audit plus the original and reversal stock movements. The current receipt tables represent the active completed receipt projection, not a second independent history store.

## 11. Pricing

Pricing is calculated from the active receiving record and the current Contractor Price for every received finished Item.

For each line:

```text
received quantity/unit
  -> exact Item unit conversion
  -> quantity in Contractor Price pricing unit
  -> quantity × scaled4 unit price
  -> money2 subtotal
```

The initial service intentionally performs **no hidden monetary rounding**. If the result cannot be represented exactly as TWD money2, automatic pricing is rejected so the data can be corrected or a later explicit rounding rule can be approved.

The completed pricing rows snapshot:

- Item identity/name;
- pricing unit;
- converted pricing quantity;
- applied unit price;
- subtotal;
- total amount.

Later Contractor Price changes do not rewrite this snapshot.

## 12. Reverse pricing / payment

The validated Legacy workflow includes explicit backward operations, retained in the new domain semantics:

```text
paid     -> cancel payment -> priced
priced   -> cancel pricing -> received
received -> cancel receipt -> outbound
```

Cancellation is not an ordinary edit. Each action records shared Audit.

The current pricing row is the active priced projection. Cancelling pricing records its transaction facts in Audit before removing the current projection and returning the workflow to `received`.

Cancelling receipt records the full receipt snapshot and consumption movement IDs in Audit, inserts linked reversal movements, and clears only the nullable receipt link before removing the active receipt projection. Original stock quantities, order links and reversal links are retained. All effects and the final master revision transition share one atomic original-revision/status gate; stale cancellation cannot unlink or remove a newer receipt.

Cancelling payment preserves the prior payment timestamp in Audit and clears the current payment projection before returning to `priced`.

## 13. Pending hard delete

Hard delete is permitted only for an authorized `pending_outbound` order that has never produced a confirmed physical outbound event.

Once outbound has ever been confirmed, the order is retained permanently and correction/cancellation uses controlled events.

## 14. Precision and unit semantics

Canonical unit conversion means:

```text
1 fromUnit = quantity toUnit
```

All stock movements are stored in Item base-unit scaled4 quantities because the stock-ledger schema intentionally does not carry a second movement-unit authority.

Formal SMART ERP rounding remains a later ERP-integration concern and is not inferred from these internal Outsourcing calculations.

## 15. Runtime gate

The integrated `#outsourcing` React route now uses the protected Worker/D1 path.

Runtime rules:

- every Contractor / BOM / stock / Outsourcing request resolves the current CYID Session and requires current `OUTSOURCING` Module Access before lookup or domain-service access;
- Item picker data comes from bounded `/api/business/outsourcing/lookups` projections under the same authority and includes allowed units;
- the current authenticated actor is used as the current React order/receipt/pricing operator;
- pending edit and all later correction/reversal actions send the current D1 revision;
- hard-delete, outbound-correction and outbound-cancellation capabilities are derived server-side from current Workspace authority;
- contractor stock remains movement-derived; no browser-local mutable balance is used as authority;
- React does not fall back to browser-local Contractor/BOM/Outsourcing/stock writes when the API fails;
- development writes target development Worker/D1 only; production cutover remains a separate explicitly approved operation.

No production Worker/D1/DNS/R2/GCS resource is changed by this development transport cutover.
