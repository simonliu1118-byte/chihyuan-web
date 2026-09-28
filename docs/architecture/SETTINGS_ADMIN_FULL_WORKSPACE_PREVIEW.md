# CY Web Settings / Admin Full Workspace Preview

> Status: browser-local functional review surface.
>
> This preview exists so Settings/Admin behavior can be tested together with the business-module previews before final UI polish and before protected HTTP wiring.

## 1. Review goal

The preview exposes the initial administration surfaces in one browser-memory workspace:

- structural settings;
- CY Web App Tags and module mappings;
- member App-Tag assignment;
- WorkLog operational configuration;
- concise Audit Log behavior;
- backup catalog and the confirmed restore confirmation flow.

All data is fictional. Role switching is a test control only and never represents production authorization.

## 2. Authority simulation

The preview can switch among:

```text
EMPLOYEE
ADMIN
SUPER_ADMIN
```

Expected behavior:

- structural settings and App-Tag/member assignment mutations: SUPER_ADMIN only;
- WorkLog operational configuration mutations: ADMIN or SUPER_ADMIN;
- EMPLOYEE: read-only administration preview.

Production authority remains server-enforced from Shared Identity and the Settings service contract.

## 3. Structural settings

The preview shows representative departments and Customer-category settings. The production service also covers Customer Status and Item Category hierarchy.

Stable codes are not edited after creation; normal maintenance changes display name, sort/active state and applicable parent relationships.

## 4. App Tags

The preview makes the identity boundary explicit:

- EMPLOYEE / ADMIN / SUPER_ADMIN belong to Shared Identity;
- CY Web App Tags only grant module-entry capability;
- App Tags may map to multiple stable module codes;
- member assignments are a separate SA-controlled mapping.

## 5. WorkLog configuration

All visible values are deliberately neutral demonstration data. Chihyuan production values are not Public-source constants.

The preview allows Admin/SA to test:

- category add/active state;
- platform add;
- scoring-reference update;
- target/minimum average-daily-score update.

The Worker service remains authoritative for optimistic concurrency, scaled4 parsing and Audit.

## 6. Audit preview

Setting mutations append simple browser-local events so the user can verify that administration changes have an observable history surface.

Production uses the shared Audit Core. The browser preview is not the Audit persistence implementation.

## 7. Backup / restore preview

The backup tab is intentionally a product-flow simulation only. It does not connect to D1, R2 or GCS.

Only the simulated SUPER_ADMIN role can operate backup controls.

Restore follows the confirmed two-step pattern:

1. explicitly confirm the selected backup;
2. after a destructive warning, type `RESTORE` before execution.

The production restore flow additionally validates:

- manifest/package readability;
- schema compatibility;
- integrity/hash;
- authorization;
- all-or-nothing restore behavior.

Failure must leave the active database unchanged. The application does not automatically choose another backup or silently roll back to a different backup set.

## 8. Runtime boundary

The preview:

- stores fictional data only in browser memory;
- resets on refresh;
- does not write D1;
- does not access R2/GCS;
- does not bypass Shared Identity;
- does not expose real production configuration or resource identifiers;
- does not change production Worker/DNS/backup resources.
