# CY Web Operational Runtime

Status: **business transport complete**; **browser-local authority retired**.

The single React application reads and mutates business data through the same-origin **Worker protected HTTP API** and D1. Customer, Item, Defect, Sales Work Order, Outsourcing and WorkLog all use their existing protected domain services. Settings and detailed Audit use `/api/admin/settings` and `/api/admin/audit`, with server-side ADMIN / SUPER_ADMIN gates and the existing Settings/Audit services.

`OperationalWorkspace.tsx`, `local-database.ts` and `advanced-local-types.ts` are retired. No active React page imports a browser-local business store or falls back to one after API errors. Settings use server concurrency tokens and preserve deactivated historical references. Audit is read-only; its detailed before/after projection is admin-only.

The static operational build contains the same React application and requires a same-origin Worker API host. It does not provide a separate storage authority. Historical standalone `preview/*` surfaces remain isolated examples and are not App entry points. The former operational static-publication workflow is retired.

Current source/runtime versions, deployment evidence and remaining non-business gates are tracked only in root `TODO.md`.

The `#programs` CY 程式 page is visible to every signed-in user without Role or business Module Access. It uses shared DataView for Desktop rows and Mobile cards, approved AITeam SVG icons, and read-only `/api/programs` metadata. Published desktop programs link to compiled Release assets; web programs link to their website. SMART Converter, CYEnvelope and CYWatermark remain descriptive placeholders with no invented version, date or download. Entry links do not grant access to another application.

The Worker refreshes only configured public CYapps formal Release families, excludes drafts/prereleases, compares numeric versions and validates exact compiled asset names/URLs. Missing assets never reuse an older download under a newer version. Lookups are bounded to eight seconds, four pages and 1 MiB per page, with no automatic request retry. A process cache lasts five minutes for current data or thirty seconds for the labelled verified snapshot. This metadata snapshot is availability data, not another business or Identity authority. Unreleased placeholders require a verified public Release configuration before downloads are enabled; private release URLs/credentials are never exposed.

Backup management uses the same React/API runtime at `#backups`, visible to SUPER_ADMIN only and protected again by the Worker. Shared DataView supplies Desktop table and Mobile cards from one grouped history projection; this does not change data authority. Initial load and manual actions have explicit loading/error states, duplicate click protection and unmount cancellation. An unconfigured storage state disables creation/retry while scoped history remains readable. Mutation messages distinguish both-provider success, valid R2 with pending/failed GCS and an unconfirmed/failed backup. Recovery execution is not a UI action in this stage.
