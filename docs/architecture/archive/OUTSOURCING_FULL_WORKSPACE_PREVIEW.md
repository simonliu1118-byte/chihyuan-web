# CY Web Contractor / BOM / Outsourcing Full Workspace Preview

> Status: browser-local functional review surface.
>
> This preview exists to test the integrated business flow before protected HTTP wiring and before final visual polish. It is not a production UI specification and does not connect to D1 or Shared Identity.

## 1. Review goal

The preview combines the first complete Outsourcing workflow in one browser-memory workspace:

- Contractor master and current Contractor Price;
- multiple BOM variants;
- pending Outsourcing order creation/edit;
- confirmed outbound and stock movement creation;
- controlled outbound correction;
- receiving with BOM selection;
- BOM-driven material consumption;
- pricing from Contractor Price;
- payment;
- backward/cancellation workflow;
- current contractor stock derived from movement rows.

The priority is functional correctness. Layout, spacing, action hierarchy and final Adaptive UI composition remain open for later concentrated review.

## 2. Functional scenarios

### Pending order

Creating or editing `待出庫` changes only planned order data. The preview must not change contractor-held stock until `確認出庫` is performed.

### Confirm outbound

`確認出庫` creates positive movement rows for the supplied material quantities and moves the order to `已出庫`.

### Correct outbound

`更正出庫` demonstrates the target semantics:

1. current active outbound movements are reversed;
2. corrected order facts replace the current active projection;
3. replacement outbound movements are created;
4. the order remains `已出庫`.

The preview uses a simple quantity multiplier only as a convenient browser-local test control. The production action will use the full controlled correction form/service contract.

### Cancel outbound

`取消出庫` reverses active outbound movements and terminates the order as `已作廢`. It does not return the same order to `待出庫`.

### Receiving

The preview includes a finished Item with two active BOM variants so explicit BOM selection can be tested. Receiving creates negative component-consumption movements from the selected BOM.

### Reverse receiving

`取消入庫` reverses active consumption movements, removes the current receipt projection and returns the order to `已出庫`.

### Pricing and payment

Pricing uses the current Contractor Price for each received Item and converts the received quantity to the configured pricing unit. Completed pricing is a transaction snapshot.

The preview provides:

```text
已入庫 -> 計價 -> 已計價 -> 付款 -> 已付款
已付款 -> 取消付款 -> 已計價
已計價 -> 取消計價 -> 已入庫
已入庫 -> 取消入庫 -> 已出庫
```

Production fixed-point and no-hidden-rounding rules are implemented in the Worker service foundation. Browser preview arithmetic is illustrative only and is not the persistence/calculation authority.

## 3. Contractor and price review

The preview allows:

- selecting Contractors;
- add/edit/deactivate/reactivate;
- current Contractor Price add/update;
- pricing-unit choice limited to the preview Item units.

Production rules remain authoritative:

- referenced Contractor is retained rather than hard-deleted;
- one current Contractor Price exists per Contractor + Item;
- price changes use optimistic revision and structured Audit.

## 4. BOM review

The preview shows multiple BOM variants for the same finished Item and allows simple add/edit tests.

Production service validation remains authoritative for Item identity, valid units, revision and recipe uniqueness.

## 5. Stock review

The `代工庫存` tab intentionally exposes both:

- current balance cards derived from movement sums;
- the underlying movement ledger, including reversal references.

This is useful for functional review because it makes the crucial BD-026/027/032/040 behavior observable instead of hiding stock side effects behind a mutable balance field.

The final ordinary-user UI does not need to expose the same diagnostic density.

## 6. Preview-only simplifications

The browser preview deliberately simplifies:

- permissions;
- exact fixed-point implementation;
- reference-number generation;
- full entity-picker behavior;
- full Contractor/BOM editors;
- server-side revision conflicts;
- Audit persistence;
- real timestamps/employee resolution.

These simplifications do not alter the production service contract already staged in the Worker foundation.

## 7. Runtime boundary

The preview:

- uses fictional static/browser-memory data only;
- resets on refresh;
- does not call production or development D1;
- does not bypass Shared Identity;
- does not connect to SMART ERP;
- does not create or bind production Worker/DNS/R2/GCS resources.
