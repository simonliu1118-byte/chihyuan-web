# CY Web Settings / Admin Module Contract

> Status: protected Worker/D1 configuration authority with operational UI.

## 1. Authority split

CY Web reuses the Shared Identity account hierarchy and does not create a second role system.

### Super Admin only

Only `SUPER_ADMIN` may mutate:

- departments;
- customer categories;
- customer statuses;
- item categories;
- CY Web app tags;
- historical app-tag metadata.

Historical tag/module/member relationships are retained in physical schema only. They are not a runtime authority or an exposed membership-management endpoint; direct Employee × Module Access is the sole module authorization path.

`ADMIN` may read these values as normal application reference data but cannot mutate them.

### Admin or Super Admin

`ADMIN` and `SUPER_ADMIN` may mutate operational WorkLog configuration:

- WorkLog categories/items;
- WorkLog platforms/channels;
- WorkLog scoring/reference rows;
- WorkLog target/minimum average-daily-score configuration.

Regular `USER` cannot mutate either configuration layer.

Server checks are authoritative; hidden/disabled UI controls are not authorization.

## 2. No production defaults in Public source

The Settings service manages schema/generic mechanics only. Chihyuan production values are runtime D1 data and are not committed as Public-source defaults.

This is especially important for WorkLog categories, platforms, score values and thresholds.

## 3. Structural lookups

Structural lookup `code` is stable after creation. Normal maintenance changes:

- display name;
- sort order;
- active/inactive state;
- Item Category parent where applicable.

Updates use `updated_at` as an optimistic concurrency token because the initial lookup tables do not have a `revision` column.

Referenced lookup rows are normally deactivated rather than hard-deleted.

Item Category parent updates reject self-parent and descendant-parent cycles.

## 4. App tags and module access

App tags are CY Web-local module-entry metadata, not replacements for Shared Identity roles.

SA may:

- create/update/deactivate app tags;
- replace a tag's module-code set;
- replace a member's app-tag assignment set.

Module codes are normalized stable application codes. Configuration change Audit records old/new module or tag-assignment sets.

A future Settings UI may hide inapplicable controls by role, but protected API enforcement must still call this authority boundary.

## 5. WorkLog categories / platforms

Admin/SA may create and maintain categories/platforms.

Stable codes are created once; subsequent maintenance changes display/behavior metadata and active state.

Historical WorkLogs keep stable foreign-key relationships. Deactivation prevents new ordinary selection without erasing retained historical data.

## 6. WorkLog scoring rows

A scoring/reference row belongs to exactly one source:

- configured WorkLog category; or
- a custom reference name.

Category-linked scoring rows preserve the schema's one-current-row-per-category constraint. Score values use scaled4 precision and may be null where a reference row is descriptive rather than numerical.

Updates use the row's `updated_at` concurrency token.

## 7. WorkLog scoring config

The singleton scoring configuration contains the current target/minimum average-daily-score values.

- first creation initializes revision 1;
- later updates require the current `revision`;
- updates increment revision;
- changes create structured Shared Audit.

Reviewed WorkLog final results remain frozen and are never recalculated merely because this current configuration changes.

## 8. Audit

Per BD-043, configuration changes produce structured Audit with actor/timestamp and useful before/after values.

This includes:

- structural setting changes;
- app-tag/module mapping changes;
- member app-tag assignment changes;
- WorkLog category/platform changes;
- WorkLog scoring/reference changes;
- scoring-config changes.

## 9. Backup / restore boundary

Backup/restore remains a separate Super Admin-only product capability under BD-044 and the shared backup architecture.

This Settings foundation does **not** bind backup providers or storage credentials. Restore still requires the confirmed double-confirmation UX plus server-side SA enforcement and Audit when that runtime capability is wired.

## 10. Runtime gate

The operational Settings and Audit pages use `/api/admin/settings` and `/api/admin/audit`. Each request resolves a CYID Session and an active App member. The server supplies actor and role; client body fields cannot override authority. Structural settings require SUPER_ADMIN; WorkLog settings permit ADMIN and SUPER_ADMIN. Audit is read-only. Worker/D1 CI acceptance exercises role denial, spoofed role rejection, persisted writes, optimistic conflicts, server-derived Audit actors and inactive-member denial. Backup/restore remains a separate runtime gate.
