# CY Web Operational Local Runtime

> Status: active implementation mode for real UI/flow testing before Shared Identity + D1 cutover.

## Purpose

CY Web stops treating business-module pages as disposable previews. The React application now runs as one integrated operational surface with persistent browser-local data.

The goal is to let business users operate the actual navigation, forms and workflow repeatedly while UI and workflow corrections are still inexpensive.

## Persistence

The initial runtime adapter uses browser `localStorage` under a versioned CY Web key.

Unlike the earlier browser-memory previews:

- reload does not reset ordinary changes;
- Customer, Item, Sales Work Order, Outsourcing and WorkLog data share one local dataset;
- cross-module references use stable numeric IDs;
- important actions append a local Audit entry;
- the complete local dataset can be exported/imported as JSON;
- an explicit reset returns to fictional seed data.

No production or development D1 data is touched in local-storage mode.

## Operational modules

The integrated app navigation now enables:

- Customer;
- Item;
- Sales Work Order;
- Contractor/BOM/Outsourcing and movement-derived contractor stock;
- WorkLog lifecycle/review;
- Settings;
- Audit.

These pages are the forward UI path. The standalone `preview/*` files remain design/history references only and should not receive new business functionality unless a focused comparison artifact is specifically required.

## Data-adapter cutover

The local runtime is deliberately a temporary persistence adapter, not a second product data model.

The next persistence cutover is:

```text
React operational UI
      ↓
shared runtime/repository boundary
      ↓
Worker protected HTTP API
      ↓
D1
```

The existing D1 schema/service contracts remain authoritative. The local runtime must not introduce fields or relationships that contradict the Final Data Dictionary / Business Decisions.

## Shared Identity

Local operational mode does not pretend to authenticate a real user. It uses explicit fictional/local actor context only where a workflow needs an actor label.

Before D1-backed multi-user operation, protected business routes still require the Shared Identity browser-session provider and server-side authorization checks.

## UI review mode

From this point forward, UI changes should normally be made directly in the operational React application and tested in-place. The expected workflow is:

1. operate the real local runtime;
2. report layout/flow/wording issues;
3. adjust the same React application;
4. keep local persistence compatible where possible;
5. cut persistence from localStorage to Worker/D1 once the runtime and Identity gates are ready.

## Runtime safety

The current local mode:

- contains only fictional seed data by default;
- never writes D1;
- never writes SMART ERP;
- never bypasses Shared Identity on a protected server route;
- does not modify production Worker, DNS, R2 or GCS resources.
