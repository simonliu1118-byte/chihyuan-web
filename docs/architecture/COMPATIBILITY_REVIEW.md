# CY Web compatibility and runtime review

Evidence review: 2026-10-01 (Asia/Tokyo). Implementation evidence only; permanent rules remain in the three governed files, shared Identity contract remains in CYID, and current progress remains in root `TODO.md`.

## Reviewed baselines

- CY Web main and `handoff/cyweb-cyid-master-2026-10-01`: `f9025de4ad9247c035b744e90bc2f015f2cdaf28`, source `0.6.0`, BUILD `0`.
- [Development Deploy #71](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36768139211) succeeded at that main commit. Item, Customer, Defect, Order and Outsourcing use protected Worker API → D1.
- `feature/worklog-worker-d1-transport`: `5307131702deaaf759ccef8de9059d23a3b5b650` contains WorkLog API client/page/App routing and source gates. It is not part of the reviewed main; no branch workflow run was returned by the review query. Its source must not be described as accepted/deployed.
- CYID main is `2a95557cf9da9d0553a1b8c39336ea002e17ff2b`, source `0.3.3` BUILD `0`; Consumer Contract `1.0.1`, minimum `1.0.0`. [CYID production provisioning #12](https://github.com/simonliu1118-byte/CYapps/actions/runs/36703608442) succeeded on its separate deployment branch. CY Web's own production business-data rollout was not performed by this review.

## Conclusion

The active Web app is one React root (`src/main.tsx` → `src/App.tsx`) and one Worker dispatch (`worker/index.ts`). No version-numbered loader/patch/Worker wrapping chain was found in these entry paths. Worker route dispatch, provider transport validation, Module Access enforcement and domain repositories have distinct responsibilities and are not redundant compatibility layers.

There are, however, obsolete Identity proxies, a required legacy provider field, duplicate local business pages and still-active browser-local Settings/Audit. Finishing only WorkLog does not remove all browser-local business/configuration state.

## Findings and disposition

| Finding | Evidence | Consequence / next change |
| --- | --- | --- |
| `groupKeys` is required despite having no authorization use | `worker/identity/cycloud-identity-adapter.ts:normalizePrincipal` rejects missing/invalid Group keys; `worker/identity/contract.ts` requires the array | A valid direct-role principal can fail login/resolve just because an obsolete descriptive field is absent. Remove the consumer dependency before provider Group-field retirement; do not add a second principal/role projection. |
| Unused Group/compatibility mutation proxies | `worker/http/identity-management-routes.ts` still proxies Group create/update/membership/access and compatibility-role-mode; current `SharedIdentityPage.tsx`/client have no caller for them | Hidden UI does not retire HTTP routes. Coordinate removal with CYID; remove unused `compatibility_role_mode` type and avoid retaining these routes for hypothetical old clients. |
| Identity transport code repeated | Auth adapter and management proxy independently parse cookie tokens/configuration and call the provider; neither provider fetch path has an explicit deadline | Duplication can be consolidated into existing transport responsibility. Hanging upstream requests are a separate resilience risk, not evidence of a wrapper chain or a demonstrated current outage. If addressed, use one bounded transport operation with stable errors and fail-closed behavior; do not introduce chained retries/Session fallbacks. |
| Duplicate old local business screens remain | `OperationalWorkspace.tsx` retains Customer/Item/Order/Outsourcing local pages while `App.tsx` routes those modules directly to the new API pages | They are not fallback on API failure, but remain duplicated source behind the exported generic workspace function. Retire those branches/functions after removing genuine type dependencies; history is already in Git. |
| WorkLog is still local on main | `App.tsx` falls through to `OperationalWorkspace` for WorkLog; the API implementation is only on the work branch | Complete review/acceptance of the existing branch and integrate it, rather than building another WorkLog adapter. Do not report branch code as deployed. |
| Settings/Audit remain browser-local and reachable | Main App routes Settings/Audit to `OperationalWorkspace`; Settings edits/imports/resets local database; Audit reads local audit array | This is an unfinished data boundary, not Identity authority. Existing D1-backed module queries do not derive their authoritative lookups/audit from this local store. The screen's claim that local settings immediately affect other modules is misleading after their cutover. Replace these remaining surfaces with the existing protected Settings/Audit services or explicitly remove unfinished actions from the runtime; do not use local data as a failure fallback. |
| Static-build comments describe a superseded runtime | `vite.operational.config.ts` still says the build does not call protected APIs/D1 | Both Vite configs use the same React source; two build configs are not two products. A static build can still require same-origin APIs. Update its documentation rather than treating it as a standalone fully local app. |
| API phase split is dispatch organization | `worker/index.ts` calls phase 1 and phase 2 route handlers, then returns 404 | These are disjoint module route sets, not wrappers around prior Worker versions. Semantic naming/consolidation can improve clarity, but should not recreate domain code or add a fallback dispatch layer. |

## Boundaries to retain

- CYID is the only credential/Session/App-entry authority; Web cookie transport and response validation protect that boundary.
- CY Web's member projection and direct Employee × Module Access remain app-local authorization; they do not mint another Identity Session.
- Every protected business request revalidates current Identity and Module authority. Browser route/module checks support UX and do not substitute for server checks.
- Five D1-backed modules have no browser-local write fallback on API failure in the reviewed source and transport validators.
- Read-only contract mirrors and version checks are required governance artifacts. They are not extra runtime providers.
- Applied schema migrations and historical previews are not current runtime compatibility wrappers and must not be blindly deleted with unused code.

## Coordinated sequence

1. Read the [CYID review](https://github.com/simonliu1118-byte/CYapps/blob/docs/cyid-compatibility-review/apps/CYCloudIdentity/docs/COMPATIBILITY_REVIEW.md), particularly the production provisioning replay risk. Do not re-run continuity provisioning as a normal deploy.
2. Remove Web Group-field dependency/proxies alongside the CYID consumer inventory and contract retirement plan; provider removal must not precede affected consumer updates.
3. Finish the existing WorkLog branch with its necessary checks; retire duplicated local business pages and complete Settings/Audit authority/presentation. Treat these as a concrete cutover, not another wrapper.
4. Consolidate existing provider transport and bounded request failures only where required; retain fail-closed behavior and cookie protection.

No runtime cleanup, remote deployment, schema/data mutation or consumer contract change was performed by this review. This document records findings and removal conditions rather than falsely reporting remediation.

## Verification

Locally passed `validate_identity_foundation.py`, `validate_module_access.py`, `validate_operational_local_runtime.py`, and Customer/Defect/Sales Order/Outsourcing transport validators on main. Inspected root/Worker dispatch, auth/management transport, active React route selection, local database call sites and WorkLog branch diff. Source-contract validators do not replace real browser/Email/device acceptance or prove unused external consumers. No new tests were added for this documentation-only change.
