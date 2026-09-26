# CY Web Business Decision Index

This index records the current interpretation of confirmed CY Web Business Decisions. It is an architecture index, not a governance rules source.

- BD-001 through BD-018 are summarized in `../BUSINESS_DECISIONS.md`; the detailed pre-consolidation text is preserved in `../archive/BUSINESS_DECISIONS_001_018_PRE_CONSOLIDATION.md`.
- BD-019 and later have individual files in this directory.
- BD-047 makes all earlier **Legacy GAS/Sheet production-migration implications non-operative**. Those passages remain useful historical context only.
- BD-049 and BD-050 refine the backup direction from BD-045/046 into a tiered R2 + GCS topology and a shared cross-App portable/service contract.
- BD-051 clarifies that WorkLog cancel-review needs structured audit but does not require retention of the cancelled score payload as a historical review version.
- BD-052 confirms that the initial CY Web field set follows the validated Legacy/GAS business model while exact SMART ERP field ownership is deferred.
- BD-053 and BD-054 define the CY Web audit boundary: ordinary edits retain last-modified metadata, meaningful business actions use structured audit, and all CY Web modules use one shared in-App Audit Core with cost-conscious payloads.
- BD-055 confirms that Legacy GAS UX is reference evidence rather than a replication target: useful proven behavior may be retained/adapted, while the new UI and implementation follow the new Web architecture and shared-component model.

## Decision index

| ID | Decision | Current status |
| --- | --- | --- |
| BD-001 | Customer internal identity and customer number lifecycle | CONFIRMED, customer-number immutability portion superseded by BD-048 |
| BD-002 | SMART ERP remains the primary ERP; CY Web is the Web/mobile complementary system | CONFIRMED |
| BD-003 | Long-term read-only SMART ERP database integration | CONFIRMED long-term direction |
| BD-004 | Item master is ERP-owned; item numbers may be remapped | CONFIRMED |
| BD-005 | Internal IDs are technical, not human-readable business codes | CONFIRMED |
| BD-006 | Formal transaction documents freeze business snapshots | CONFIRMED |
| BD-007 | Contractor/vendor may be a person or an organization | CONFIRMED |
| BD-008 | Customer region is geographic; business ownership is organizational | CONFIRMED |
| BD-009 | Customer region is independent from individual addresses | CONFIRMED |
| BD-010 | Configurable business lookups are separate from fixed workflow states | CONFIRMED |
| BD-011 | Previous SMART ERP item numbers remain searchable until explicitly retired | CONFIRMED |
| BD-012 | WorkLog scoring rules are configurable; finalized scores are frozen | CONFIRMED; explicit cancel-review behavior refined by BD-051 |
| BD-013 | ERP qualification is separate from configurable customer business status | CONFIRMED; transaction-gating interpretation refined by BD-035 |
| BD-014 | Closed-business customers remain historical but cannot create new commercial transactions | PARTIALLY SUPERSEDED by BD-035; retention/visibility intent remains |
| BD-015 | Customer visit person may link to a contact but always keeps a visit-time snapshot | CONFIRMED |
| BD-016 | Customer tax ID may repeat; duplicates require a strong warning | CONFIRMED |
| BD-017 | Quantities and monetary values support decimal precision | CONFIRMED |
| BD-018 | TWD formal monetary amounts use a two-decimal baseline pending SMART ERP confirmation | CONFIRMED BASELINE |
| BD-019 | Quantity and unit-price precision baseline | CONFIRMED |
| BD-020 | CY Web Quote is a customer-item price record; formal quotations remain in SMART ERP | CONFIRMED |
| BD-021 | Customer-item quote history preserves Legacy usage semantics | CONFIRMED |
| BD-022 | Existing customer-item quote records may be corrected with audit; new commercial prices create new history | CONFIRMED |
| BD-023 | Customer frequent items may include unfiled free-text products | CONFIRMED |
| BD-024 | CY Web sales work order is a pre-ERP order that continues through ERP handoff and shipment | CORRECTED / CONFIRMED |
| BD-025 | Legacy Desktop is the canonical workflow baseline; Legacy Mobile is incomplete | CONFIRMED as behavior-reference precedence |
| BD-026 | Outsourcing stock becomes contractor-held only when outbound is confirmed | CONFIRMED |
| BD-027 | Outsourcing hard delete is allowed only before confirmed outbound | CONFIRMED |
| BD-028 | Resolved defect reports may be reopened through an explicit status transition | CONFIRMED |
| BD-029 | Sales work orders become voidable, not hard-deletable, after ERP issuance | CONFIRMED |
| BD-030 | Referenced master data is retained; hard delete is limited to never-used records | CONFIRMED |
| BD-031 | Sales work-order customer entry stays simple; no automatic customer guessing | CONFIRMED |
| BD-032 | Confirmed outsourcing outbound is corrected through controlled events, not ordinary edit | CONFIRMED |
| BD-033 | Defect record edit and deletion boundaries follow lifecycle state | CONFIRMED |
| BD-034 | ERP data uses one fill/correct action with preserved correction history | CONFIRMED |
| BD-035 | Closed-business customer status is informational and does not block CY Web workflows | CONFIRMED; supersedes BD-014 transaction gating/reopen requirement |
| BD-036 | Multiple BOM variants are allowed; receiving selects the BOM, and contractor pricing has an explicit pricing unit | CONFIRMED |
| BD-037 | CY Web reuses shared Identity roles and uses app-specific tags only for module access | CONFIRMED |
| BD-038 | Contractor Price has one current record per Contractor + Item | CONFIRMED |
| BD-039 | Frequent free-text items link to formal Items only through explicit selection | CONFIRMED |
| BD-040 | Cancelling a confirmed outsourcing outbound voids the outsourcing order | CONFIRMED |
| BD-041 | WorkLog work days are required and review-correctable | CONFIRMED |
| BD-042 | Public WorkLog source provides configurable structure, not Chihyuan production parameters | CONFIRMED |
| BD-043 | CY Web configuration authority is split between Super Admin and Admin | CONFIRMED |
| BD-044 | In-app backup and restore are Super Admin-only with double confirmation | CONFIRMED |
| BD-045 | Chihyuan production backup uses GCS through a provider-neutral contract | CONFIRMED; provider role refined by BD-049 |
| BD-046 | Backup service contract, storage-provider boundary, and portable package format | CONFIRMED; cross-App/package boundary extended by BD-050 |
| BD-047 | CY Web production starts clean; Legacy test data is not migrated | CONFIRMED |
| BD-048 | SMART ERP customer number may be corrected or changed without changing customer identity | CONFIRMED; supersedes BD-001 immutability clause |
| BD-049 | Tiered backup uses R2 for daily operational recovery and GCS for cross-cloud disaster recovery | CONFIRMED; refines BD-045 |
| BD-050 | CY Web and CYAccountingWeb share one portable backup contract and converge on CY Backup Service | CONFIRMED; extends BD-046 |
| BD-051 | WorkLog cancel-review requires audit, not retained review-version history | CONFIRMED; refines BD-012 review-reopen handling |
| BD-052 | Initial CY Web field set follows validated Legacy/GAS design; SMART ERP field ownership is deferred | CONFIRMED |
| BD-053 | General edits keep only last-modified metadata; detailed audit is Admin/SA-only | CONFIRMED |
| BD-054 | CY Web uses one shared in-App Audit Core with cost-conscious storage | CONFIRMED; scoped to CY Web only |
| BD-055 | Legacy UX is reference evidence, not a replication target; retain/adapt good proven behavior under the new architecture | CONFIRMED |

## Cross-decision supersession / refinement notes

### Legacy migration

BD-047 retires the assumption that the current GAS / Google Sheets dataset must be imported into production D1. Any older text describing Legacy value-level profiling, importer design, `legacy_id_map`, migration reconciliation, or Legacy-data cutover is historical/non-operative unless a future explicit decision reintroduces that requirement.

This does **not** remove normal forward D1 schema migrations and does not cancel the future SMART ERP item-code renumbering operation in BD-011.

### Customer number

BD-048 changes only the assigned-number immutability rule from BD-001. The Customer's internal ID remains immutable; `customer_no` remains ERP-owned, nullable before assignment, unique when present, and never used as a relational key.

### Closed-business status

BD-035 supersedes the transaction-blocking and mandatory-reopen behavior in BD-014. `closed_business / 已歇業` remains visible and historically retained, but does not by itself block supported CY Web workflows.

### WorkLog review cancellation

BD-051 clarifies BD-012's finalized-score rule. A completed review remains frozen against later scoring-configuration changes while it is active, but an explicit authorized `取消審核` action may clear the current review/scoring values and return the WorkLog to `pending_review`. The cancellation itself must remain in structured audit/history; the cancelled score payload does not need a retained review-version snapshot in the initial schema.

### Initial field ownership / SMART ERP integration timing

BD-052 keeps SMART ERP as the long-term primary ERP direction but removes future ERP schema investigation from the initial Data-Dictionary gate. Initial CY Web fields follow the validated Legacy/GAS business semantics and confirmed Business Decisions; exact ERP-owned/read-only/synchronized classification is deferred until the later SMART ERP integration project.

### CY Web audit architecture

BD-053 defines the difference between ordinary last-modified metadata and meaningful structured business audit. BD-054 requires one shared Audit Core inside CY Web so modules do not maintain separate audit implementations. Audit payloads must remain compact because D1 audit growth also increases R2/GCS backup volume. This shared-core decision does not currently apply to CYAccountingWeb, CYInvoice or other separately developed Apps.

### Legacy UX and new Web design

BD-055 makes Legacy behavior a source of evidence, not a screen blueprint. Proven interaction details may be retained or adapted when they still serve the current workflow, but UI structure, component implementation, responsive behavior and common mechanics must follow the new CY Web architecture. GAS-era workarounds and duplicated per-page/per-device implementations are not preserved merely for familiarity.

### Backup topology

BD-049 keeps the core intent of BD-045 — GCS remains an independent off-cloud recovery destination — but adds Cloudflare R2 as the primary daily operational backup tier. The standard target is daily R2 plus Wednesday/Sunday GCS replication of the exact same logical backup set.

BD-050 extends BD-046 so CY Web and CYAccountingWeb share the same outer package/integrity/provider contract and can later move provider storage/replication/retention behind a common CY Backup Service / Worker. App-specific export and restore semantics remain inside each application.

Current detailed backup architecture is consolidated in `../BACKUP_ARCHITECTURE.md`.

## Use during implementation

Before asking the user a new business-rule question:

1. check this index;
2. read the applicable decision file(s);
3. check whether a later decision superseded or refined an older statement;
4. ask only if the semantic point genuinely remains unresolved.
