# CY Web Customer UI Review Backlog

> Status: non-blocking visual/polish backlog captured during browser review.
>
> Current priority is to validate Customer functionality and end-to-end interaction first. These items must not be forgotten, but they do not block the integrated functional preview.

## Confirmed review notes

1. **Search Pane / Detail Pane top alignment**
   - The left Customer search card and the right Customer Detail card currently do not start at exactly the same vertical position.
   - Final layout should align their top edges.

2. **Search-result column stability**
   - Region and status must keep stable positions regardless of status-label length.
   - Example observed: `潛在客戶` is wider than `往來中`, causing the region text to shift. This is not acceptable in the final result-row layout.

3. **Customer header action density**
   - The `修改` button should eventually be a normal single-line-height action aligned approximately with the Customer title row rather than a tall block.
   - A second Customer lifecycle action may occupy the area below it, e.g. `停用` or `刪除`, but the exact action must follow the final Customer lifecycle/deletion rule rather than being chosen only for visual symmetry.

4. **Lower-detail visual polish deferred**
   - Basic data, ownership, contact, address, notes and related-record detail spacing/typography will be reviewed together after functional completeness is proven.

## Current priority

Before spending more time on visual polish, validate one integrated Customer workspace that includes:

- Customer search/select;
- Customer create/edit;
- Visit create/edit/delete;
- Quote create/correction with price breaks;
- Frequent Item edit with formal/free-text identity;
- unsaved-change protection and duplicate Tax-ID confirmation;
- related records embedded in the same Customer Detail Pane rather than a separate production page.

The temporary standalone related-record review page is development scaffolding only and is not a production navigation destination.
