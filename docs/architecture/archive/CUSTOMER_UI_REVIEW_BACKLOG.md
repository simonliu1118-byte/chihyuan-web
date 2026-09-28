# CY Web Customer UI Review Backlog

> Status: browser-review backlog captured during Customer functional testing.
>
> Functionality remains the main priority, but readability and basic action accessibility are **must-fix usability requirements**, not optional visual polish.

## Must-fix usability baseline

1. **Readable business text**
   - The first integrated preview used too much 10–12px text and was difficult to read on a normal Desktop display.
   - Normal business content should target roughly 14–16px depending on hierarchy; 10–12px is reserved for genuinely secondary metadata only.
   - Form controls must be comfortably readable without browser zoom.
   - The React foundation now loads a dedicated readability baseline, and the integrated browser preview has a readable V2 review surface.

2. **Edit actions at both top and bottom**
   - When Customer enters create/edit mode, `取消` and `儲存` must remain available in the Customer header action position.
   - The same `取消` and `儲存` actions must also appear after the final edit section.
   - Users changing only upper fields must not be forced to scroll to the bottom to save/cancel; users already at the bottom must not be forced back to the top.
   - Both action sets invoke the same save/cancel behavior and the same unsaved-change/validation rules.

## Confirmed visual review notes for later batch refinement

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
   - Basic data, ownership, contact, address, notes and related-record spacing will be reviewed together after functional completeness is proven.
   - Typography is excluded from this deferral because basic readability is already a must-fix requirement.

## Current priority

Validate one integrated Customer workspace that includes:

- Customer search/select;
- Customer create/edit with top + bottom save/cancel access;
- Visit create/edit/delete;
- Quote create/correction with price breaks;
- Frequent Item edit with formal/free-text identity;
- unsaved-change protection and duplicate Tax-ID confirmation;
- related records embedded in the same Customer Detail Pane rather than a separate production page.

The temporary standalone related-record review page is development scaffolding only and is not a production navigation destination.
