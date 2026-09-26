# CY Web UI Foundation

> Status: implementation architecture baseline before production business screens.
>
> This document defines **how shared UI/interaction capability is structured**. It does not freeze the final visual design, colors, spacing scale, or exact screen composition. Those remain subject to dedicated UI/UX review with the user.

## 1. Core principle

CY Web is a new Web system, not a visual or code-port of the Legacy GAS application.

Legacy is used as operational evidence:

- proven behaviors that remain useful may be retained or adapted;
- workflows and information relationships are checked so useful capability is not lost;
- GAS/Sheets workarounds, duplicated implementation, outdated visual constraints, and obsolete interaction patterns are redesigned or removed.

BD-055 is the controlling decision for this boundary.

The implementation test for any Legacy behavior is:

1. What user/business need was it solving?
2. Is that need still valid in CY Web?
3. Is the old interaction still a good way to solve it?
4. If yes, retain/adapt the useful behavior using the new architecture.
5. If no, redesign it using modern Web interaction patterns.

The goal is **continuity of useful workflow**, not continuity of old screen structure.

## 2. One Web application, adaptive presentation

CY Web maintains one primary frontend codebase.

Desktop, Tablet and Mobile share:

- domain rules;
- API contracts;
- validation;
- permissions;
- request/query state;
- record editor state;
- entity lookup semantics;
- audit/history source;
- action results.

Presentation may adapt by viewport and task.

Examples:

- Desktop may show a dense table while Mobile shows cards.
- Desktop may keep detail and related records visible together while Mobile uses stacked sections, Drawer, Bottom Sheet or full-screen detail.
- Large editable line-item grids may remain tabular on Desktop while Mobile uses focused row editors.

Adaptive presentation must not create separate duplicated business implementations.

## 3. Shared UI architecture layers

### Layer A — Design primitives

Low-level reusable visual/interaction primitives:

- Button / IconButton
- Input / TextArea / Select / Checkbox / Radio
- Field / FieldError / HelpText
- StatusChip / Badge
- Card / Section / Divider
- Dialog / ConfirmDialog
- Drawer / BottomSheet
- Toast / Notice
- Skeleton / Spinner / Progress
- EmptyState / ErrorState
- Tabs / segmented navigation where appropriate

These components own consistent interaction states, accessibility and Design System styling. Business modules must not create visual look-alikes with private CSS unless a real exception exists.

### Layer B — Shared interaction patterns

Higher-level reusable behavior observed repeatedly across Legacy modules:

- record create/view/edit/cancel lifecycle;
- dirty/unsaved-change guard;
- standard record action area;
- searchable/filterable data view;
- adaptive Desktop table / Mobile list-card projection;
- related-record section;
- editable multi-row list/grid;
- generic entity picker / autocomplete;
- unit picker and conversion display helper;
- keyboard data-entry navigation;
- async loading/error/retry pattern;
- concise Audit timeline;
- Admin/SA detailed Audit viewer.

These are the main replacement for the old pattern where each GAS page implemented the same mechanics independently.

### Layer C — Domain adapters

Shared interaction components receive domain configuration/adapters rather than embedding business rules.

Examples:

- `EntityPicker` is generic; Customer picker and Item picker provide search/display/select adapters.
- `EditableList` is generic; Sales Work Order lines and Outsourcing receiving rows provide different columns and validation.
- `StatusChip` is generic; Order and WorkLog provide their own status definitions.
- record editor mechanics are shared; business actions such as ERP issue, WorkLog review, Outsourcing receiving remain domain-specific.

### Layer D — Business screens

Customer, Item, Sales Work Order, Outsourcing, WorkLog, Settings/Admin screens compose the shared layers and contain only their genuine business differences.

A business screen should not reimplement generic dialogs, loading states, search-combobox behavior, record-editor state, dirty guards, data-list mechanics, or status presentation.

## 4. Record editing model

Legacy has multiple incompatible variations of `VIEW_EMPTY / VIEW_LOADED / ADDING / EDITING`. CY Web should expose one shared semantic model instead of depending on numeric state values.

Initial semantic modes:

- `empty` — no selected record;
- `view` — record loaded, read-only presentation;
- `create` — new unsaved record;
- `edit` — existing record has editable working state.

Shared mechanics should own:

- original snapshot for cancel/revert where needed;
- dirty detection;
- save-in-progress lock;
- standard Add / Edit / Save / Cancel affordances;
- navigation-away protection;
- conflict state from optimistic concurrency;
- common validation/error presentation.

Domain modules may add domain workflow actions, but must not fork the basic editor lifecycle without a real business reason.

## 5. Search and data-view model

Search/list screens use a shared data-view contract.

The shared layer should support:

- keyword search;
- module-defined filters;
- sort;
- pagination/cursor when required;
- loading / empty / error states;
- selected-row state;
- Desktop columns;
- Mobile card projection;
- keyboard/mouse/touch selection where appropriate.

The API is the source for business data. CY Web must not recreate the Legacy pattern of loading the entire business dataset into a browser-global `db` object and filtering everything locally by default.

## 6. Related-record sections

The Legacy term 「頁內表單」 / `general-table` is not carried forward as a required component name or appearance.

The useful underlying concept is retained:

> While working with a business record, related records should be accessible in context without forcing unnecessary navigation.

Examples include:

- Customer → Visits;
- Customer → Quote history;
- Item → Defects;
- Order → related Customer / Quote context;
- record → concise Audit timeline.

The shared related-record data view should provide consistent loading, empty, error, action and responsive behavior.

The exact UI may be table, list, card, collapsible section, side panel or another modern pattern depending on device and task.

## 7. Editable multi-row data

Sales Work Order lines, Quote price breaks, Outsourcing outbound/receiving/pricing rows and WorkLog structured rows share common mechanics but different domain rules.

A shared editable-list/grid foundation should provide:

- row identity;
- add/remove/reorder when allowed;
- validation state per row/cell;
- numeric formatting;
- entity lookup cells;
- unit selection;
- keyboard progression;
- read-only versus edit presentation;
- responsive adaptation;
- clean serialization to a domain payload.

Domain modules own the allowed columns, calculations and server validation.

## 8. Entity lookup

Customer and Item lookup should use one reusable search-combobox/entity-picker foundation.

The shared picker owns:

- input/search interaction;
- debounce/cancellation;
- loading and no-result state;
- keyboard selection;
- click/touch selection;
- accessible popup behavior;
- outside dismissal;
- selected-entity identity handling.

Domain adapters own:

- API endpoint/query;
- display label/subtext;
- fields populated after selection;
- optional actions such as opening the selected Customer.

Internal immutable IDs remain the relationship value. Human-readable numbers and names are search/display values.

## 9. Feedback and dialogs

Routine success must not require blocking acknowledgement.

Default patterns:

- save succeeded → Toast or equivalent non-blocking feedback;
- field invalid → inline field error;
- page/section request failed → recoverable error state with retry where useful;
- destructive/irreversible action → confirmation dialog;
- high-risk actions such as Restore → stronger confirmation defined by the applicable Business Decision;
- loading → local skeleton/spinner/progress when possible rather than a full-screen overlay for every request.

Legacy refresh/update prompts are not carried forward merely because they existed in GAS.

## 10. Navigation and unsaved changes

Unsaved-change protection is a shared application behavior.

It must cover relevant navigation paths consistently:

- module navigation;
- tabs/subviews;
- browser route changes;
- closing a Drawer/Sheet/detail editor when it would discard work;
- browser unload where technically appropriate.

The UX should avoid repetitive alerts. The shared guard decides whether navigation is safe and invokes the common confirmation pattern only when data would actually be lost.

## 11. Keyboard and accessibility

Keyboard efficiency is a legitimate useful Legacy behavior and should be retained where it improves office workflows.

However, CY Web must not recreate page-specific document-level Enter handlers that override browser behavior unpredictably.

Shared form/grid components should define keyboard behavior explicitly and accessibly, including:

- logical Tab order;
- optional Enter progression for data-entry workflows;
- Escape behavior for dismissible overlays when appropriate;
- arrow-key/select behavior for comboboxes and menus;
- visible focus states;
- no focus traps outside true modal contexts.

Touch and pointer users must receive equivalent functionality.

## 12. Status and workflow actions

Status presentation is shared; workflow meaning is not.

Shared UI owns consistent:

- status chip/badge appearance;
- disabled/busy action state;
- placement pattern for primary/secondary/destructive actions;
- confirmation presentation.

Each domain owns:

- valid states;
- transition rules;
- permission rules;
- server validation;
- resulting Audit event.

A generic status component must not become a generic business-state engine.

## 13. Audit presentation

BD-053/054 already establish one CY Web Audit Core.

UI follows the same principle:

- normal business screens use one shared concise timeline component where useful;
- detailed Audit Log is one shared Admin/SA interface;
- modules do not create separate history UI stores or custom audit viewers;
- technical payload is not exposed in ordinary record views.

## 14. Data freshness

The new frontend must not reproduce GAS-era manual refresh workarounds.

The shared request/query layer should provide consistent revalidation behavior after writes and when entering/re-entering relevant views. Exact background refresh/revalidation policy remains an implementation detail to finalize during UI/API integration.

A manual refresh action may exist where useful, but routine correctness must not depend on users repeatedly refreshing the entire page.

## 15. Styling and final visual design

This document intentionally does **not** freeze:

- final colors;
- typography scale;
- exact spacing/radius/shadow tokens;
- navigation shape;
- exact Customer/Order screen composition;
- final table density;
- final Mobile presentation choices.

Those should be evaluated as a coherent modern CY Web Design System, not inherited from GAS CSS.

The visual review should consider:

- enterprise clarity without looking dated;
- high information density on Desktop without visual clutter;
- clear hierarchy and strong scanability;
- efficient keyboard workflows;
- touch-friendly Mobile controls;
- accessible contrast/focus/error states;
- consistent behavior across modules.

Useful Legacy information grouping may be retained when it remains effective, but not by default.

## 16. Implementation gate before first business screen

Before implementing the first production Customer screen:

1. shared UI folder/layer boundaries are established;
2. API client/request-state pattern is established;
3. record editor state/dirty guard pattern is established;
4. shared feedback/error/loading primitives are established;
5. searchable/adaptive data-view contract is established;
6. generic entity-picker contract is established;
7. editable-list contract is established before the first module that needs it;
8. Desktop/Tablet/Mobile behavior is planned from the same component/data contract;
9. the first actual visual composition is reviewed as a **new CY Web design**, with Legacy only as workflow evidence.

Do not create a complete generic framework in advance for hypothetical needs. Build the shared foundation to the confirmed repeated patterns, then extend it when a second real use case proves the abstraction.

## 17. Engineering anti-patterns

Do not reintroduce these Legacy structural problems:

- one copy of the same component/behavior per module;
- separate Desktop and Mobile business source trees;
- large browser-global mutable datasets;
- page-specific modal/toast/loading systems;
- direct DOM mutation as the normal React state model;
- duplicated Customer/Item lookup implementations;
- duplicated record-state enums with different numeric meanings;
- shared components containing hard-coded single-module business rules;
- copying old HTML/CSS structure simply because the behavior came from Legacy.

The target is a modern shared Web foundation with selective preservation of useful workflow behavior.