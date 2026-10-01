# CY Web Operational Runtime

Status: **business transport complete**; **browser-local authority retired**.

The single React application reads and mutates business data through the same-origin **Worker protected HTTP API** and D1. Customer, Item, Defect, Sales Work Order, Outsourcing and WorkLog all use their existing protected domain services. Settings and detailed Audit use `/api/admin/settings` and `/api/admin/audit`, with server-side ADMIN / SUPER_ADMIN gates and the existing Settings/Audit services.

`OperationalWorkspace.tsx`, `local-database.ts` and `advanced-local-types.ts` are retired. No active React page imports a browser-local business store or falls back to one after API errors. Settings use server concurrency tokens and preserve deactivated historical references. Audit is read-only; its detailed before/after projection is admin-only.

The static operational build contains the same React application and requires a same-origin Worker API host. It does not provide a separate storage authority. Historical standalone `preview/*` surfaces remain isolated examples and are not App entry points. The former operational static-publication workflow is retired.

Current source/runtime versions, deployment evidence and remaining non-business gates are tracked only in root `TODO.md`.
