# CY Web Business Decision Index

This index records the current interpretation of confirmed CY Web Business Decisions. It is an architecture index, not a governance rules source.

- BD-001 through BD-018 are summarized in `../BUSINESS_DECISIONS.md`; the detailed pre-consolidation text is preserved in `../archive/BUSINESS_DECISIONS_001_018_PRE_CONSOLIDATION.md`.
- BD-019 and later have individual files in this directory.
- BD-047 makes all earlier **Legacy GAS/Sheet production-migration implications non-operative**. Those passages remain useful historical context only.

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
| BD-012 | WorkLog scoring rules are configurable; finalized scores are frozen | CONFIRMED |
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
| BD-045 | Chihyuan production backup uses GCS through a provider-neutral contract | CONFIRMED |
| BD-046 | Backup service contract, storage-provider boundary, and portable package format | CONFIRMED |
| BD-047 | CY Web production starts clean; Legacy test data is not migrated | CONFIRMED |
| BD-048 | SMART ERP customer number may be corrected or changed without changing customer identity | CONFIRMED; supersedes BD-001 immutability clause |

## Cross-decision supersession notes

### Legacy migration

BD-047 retires the assumption that the current GAS / Google Sheets dataset must be imported into production D1. Any older text describing Legacy value-level profiling, importer design, `legacy_id_map`, migration reconciliation, or Legacy-data cutover is historical/non-operative unless a future explicit decision reintroduces that requirement.

This does **not** remove normal forward D1 schema migrations and does not cancel the future SMART ERP item-code renumbering operation in BD-011.

### Customer number

BD-048 changes only the assigned-number immutability rule from BD-001. The Customer's internal ID remains immutable; `customer_no` remains ERP-owned, nullable before assignment, unique when present, and never used as a relational key.

### Closed-business status

BD-035 supersedes the transaction-blocking and mandatory-reopen behavior in BD-014. `closed_business / 已歇業` remains visible and historically retained, but does not by itself block supported CY Web workflows.

## Use during implementation

Before asking the user a new business-rule question:

1. check this index;
2. read the applicable decision file(s);
3. check whether a later decision superseded an older statement;
4. ask only if the semantic point genuinely remains unresolved.
