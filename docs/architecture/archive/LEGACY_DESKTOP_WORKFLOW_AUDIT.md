# Legacy Desktop Workflow Audit — Reference Index

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: verified behavior-reference evidence. The original detailed workflow audit is preserved at `archive/LEGACY_DESKTOP_WORKFLOW_AUDIT_PRE_CONSOLIDATION.md`.

## Authority and role

Per BD-025, when Legacy behavior is consulted:

1. current explicit user decisions win;
2. confirmed CY Web Business Decisions win next;
3. Legacy Desktop + shared GAS backend are the primary Legacy behavior reference;
4. Legacy Mobile is supplemental only when it does not conflict with the above.

The Legacy system is not the production data source and its current test rows are not migrated (BD-047).

## Verified behavior areas retained as reference

The detailed audit verified Legacy Desktop behavior for:

- Customer master, Visit, customer-item Quote history, Frequent items;
- field/pre-ERP sales work orders through ERP handoff, picking and shipment;
- Item and Defect workflows;
- Contractor, BOM, Outsourcing outbound/receiving/pricing/payment and stock effects;
- WorkLog submission/review/scoring lifecycle;
- Settings, module permissions and audit/history behavior.

These observations informed the Business Decisions. Implementation should now follow confirmed decisions rather than re-copying Legacy code quirks.

## Follow-up questions from the old audit — current resolution

The pre-consolidation audit ended with several questions. They are no longer a valid current TODO list:

- Outsourcing hard delete after stock activity → resolved by BD-027.
- Defect reopening → resolved by BD-028 and edit/delete boundaries in BD-033.
- WorkLog review/scoring lifecycle → refined by BD-012, BD-041, BD-042 and BD-043; exact correction-schema details remain Data-Dictionary work.
- Item master authority → resolved at the top level by BD-004; exact SMART ERP field ownership still requires the future ERP schema/integration investigation.
- Audit coverage → current model intentionally improves Legacy gaps through structured audit; exact event payload/index details remain implementation design.

Additional later workflow decisions include BD-029 through BD-040 for work-order, outsourcing, ERP correction, customer status, BOM/pricing, and frequent-item behavior.

## Current implementation reference

Before implementing a workflow:

1. read `decisions/README.md`;
2. read the applicable `BD-*.md` files;
3. read `CANONICAL_DATA_MODEL.md`;
4. consult the archived Legacy workflow audit only for unresolved behavioral detail.

Do not treat an old Legacy capability as a mandatory target behavior when a later Business Decision intentionally changed it.

## Detailed historical audit

For traceability only, see:

`archive/LEGACY_DESKTOP_WORKFLOW_AUDIT_PRE_CONSOLIDATION.md`
