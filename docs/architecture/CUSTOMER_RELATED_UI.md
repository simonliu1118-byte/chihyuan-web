# CY Web Customer Related-Record UI Foundation

> Status: first Customer related-record UI review foundation.

## 1. Purpose

Customer already uses the approved left Search Pane + right Detail Pane master-record layout. This document defines the first visual/interaction contract for the contextual records shown below the Customer profile:

- Visits;
- Customer-Item Quote history;
- Frequent Items;
- concise future Audit/History.

The related area is not the old GAS `頁內表單` reproduced under a new name. It is a new-Web contextual-record surface using shared primitives and on-demand data contracts.

## 2. Shared component boundary

`RelatedRecordPanel` is the first shared shell for master-record contextual data.

It owns only reusable interaction structure:

- accessible tab list;
- active-tab state presentation;
- optional count/badge;
- optional header action area;
- one content panel.

It does **not** know Customer/Item/Contractor business semantics. Domain modules supply their own tabs, actions and content.

This keeps the useful common UI in one place without forcing unrelated domains into one generic data model.

## 3. Customer composition

The Customer related tabs remain inside the selected Customer Detail Pane:

```text
Customer Detail
├─ profile / contact / address / notes
└─ RelatedRecordPanel
   ├─ 拜訪紀錄
   ├─ 報價紀錄
   ├─ 常用商品
   └─ 動態 / 歷史
```

Switching tabs must not reload the Customer master or the whole application. Production data is queried only for the selected related resource.

## 4. Visit presentation

Visit history is a compact chronological timeline/list rather than a disabled form.

Visible hierarchy:

- visit date;
- visit-time person snapshot;
- recording employee;
- visit content.

The UI treats `person_snapshot` as historical display text. Later Contact renames/deactivation do not rewrite what was recorded for the Visit.

Long Visit history uses server pagination/on-demand loading rather than preloading every Visit with Customer detail.

## 5. Quote-history presentation

Customer Quote history is explicitly a Customer + Item price-history surface, not a formal quotation document.

A quote card emphasizes:

- quote date;
- Item number/name snapshot;
- employee;
- quantity / unit / unit-price breaks.

Multiple records for the same Customer + Item remain chronologically visible. A later commercial price is a new history record rather than replacement of the old record.

A factual correction to an existing quote is a separate audited operation per BD-022. The first UI preview therefore does not expose a casual inline overwrite affordance.

## 6. Frequent Item presentation

Frequent Items visually distinguish:

- formal Item relation;
- free-text / unfiled customer intelligence.

The UI must not make a free-text row look as if it is already a formal Item. A free-text row becomes linked only after the user explicitly selects the intended formal Item per BD-039.

## 7. Audit / history presentation

The current `動態 / 歷史` tab remains deliberately restrained until authenticated Audit API integration exists.

Ordinary Customer edits are not shown as an unlimited field-change feed. The future concise timeline surfaces meaningful Audit Core events plus current latest-modifier metadata according to BD-053/054.

## 8. Adaptive UI

Desktop may show the related panel at full Detail-Pane width.

Tablet/Mobile reuse the same related-resource state and components:

- tabs remain horizontally scrollable where needed;
- quote/frequent layouts collapse naturally;
- Visit timeline remains readable;
- there is no separate Mobile business implementation.

## 9. Review route

During foundation development, `#customer-related-preview` mounts a static related-record review page using fictional data.

This route exists only to inspect layout/information density. It does not:

- call protected Customer APIs;
- write D1;
- represent production data;
- bypass Shared Identity;
- freeze final colors/branding.

The production Customer screen later embeds the same shared `RelatedRecordPanel` and domain content into the Customer Detail Pane when protected API wiring is available.
