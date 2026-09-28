# Legacy Reusable Behavior / UI Pattern Audit

> Status: pre-business-module implementation audit. This document records reusable behavior and UI semantics observed in the Legacy GAS implementation. It is not a requirement to reproduce the Legacy visual design.

## 1. Purpose

Before CY Web begins real business-module UI/feature implementation, review the Legacy implementation across modules as a whole rather than rebuilding each screen independently.

The Legacy GAS system already contains many repeated interaction patterns and even documents some of them as shared conventions, but GAS/template constraints and incremental development caused the actual implementation to remain duplicated per module and, in some cases, per Desktop/Mobile source file.

CY Web should preserve useful business/interaction semantics while replacing duplicated implementation with reusable Web components, hooks/services and validation helpers.

The rule for this audit is:

> Repeated behavior or presentation semantics should be implemented once in the CY Web shared foundation unless a real domain difference requires a specialized variant.

This does **not** mean reproducing the Legacy component appearance or naming. For example, the Legacy concept called `general-table` / 「頁內表單」 is evidence that several modules need a common related-record/list presentation; the new system may use a different modern component and adaptive mobile presentation.

## 2. Legacy sources reviewed

Primary Desktop behavior/UI evidence reviewed in the Private Legacy repository:

- `CLAUDE.md`
- `js_common.html`
- `html_customer_desktop.html` / `js_customer_desktop.html`
- `html_order_desktop.html` / `js_order_desktop.html`
- `html_item_desktop.html` / `js_item_desktop.html`
- `html_log_desktop.html` / `js_log_desktop.html`
- `html_outsourcing_desktop.html` / `js_outsourcing_desktop.html`
- `js_customer_mobile.html` as representative evidence of Desktop/Mobile duplication

Mobile Legacy remains secondary behavior evidence because the new CY Web keeps one RWD + Adaptive codebase rather than separate Desktop/Mobile applications.

## 3. What the Legacy documentation already treats as shared

Legacy documentation defines common conventions for several patterns, including:

- `general-table` for in-page related-record tables;
- `input-list-table` for editable multi-row input lists;
- add/remove row controls;
- Item number/name lookup and dropdown behavior;
- Customer number/name lookup and dropdown behavior;
- unit selector / conversion display behavior;
- Enter-key navigation in multi-field/editable lists;
- common operation-log presentation;
- common dialogs/loading behavior in `js_common.html`.

The existence of those conventions is useful product evidence, but the new system should not copy their CSS/DOM implementation directly.

## 4. Repetition observed in the actual Legacy source

### 4.1 Record editor state and action buttons

Customer, Order, Item, WorkLog and Outsourcing each maintain their own variation of:

- empty / loaded / adding / editing state;
- Add / Edit / Save / Cancel / Delete button state;
- field enable/disable logic;
- current-record tracking;
- restoring the original record on Cancel;
- edit-lock checks.

Examples include `currentState_c`, `currentState_o`, `currentState_i`, `currentState_l`, plus separate Outsourcing states and nested sub-record states. Item even carries a different state-number ordering through `STATE_I` / `STATE_DR`.

This is a shared interaction model implemented repeatedly and is a strong candidate for one reusable CY Web record-editor state/helper layer.

### 4.2 Unsaved-edit navigation guard

Each subsystem separately implements `isFormLocked_*()` and tab/system navigation checks such as `switchTab_c`, `switchTab_o`, `switchTab_i`, `switchTab_l`, `switchOutsourcingTab_m`.

The semantic requirement is common:

- when a record has unsaved edits, navigation that would discard them must be blocked or explicitly confirmed;
- the exact new Web UX may use route/tab guards rather than Legacy alert boxes.

This should be one shared unsaved-changes/navigation-guard mechanism, not one copy per module.

### 4.3 Search result list / selection

Customer, Item, Order, WorkLog and Outsourcing each implement their own:

- keyword handling;
- filters;
- result rendering;
- empty-state rendering;
- row/card selection;
- switch from search result to record detail.

The new system should use a shared searchable-list/data-view foundation with module-supplied columns/cards, filters and query contract.

Desktop and Mobile presentation can differ adaptively while sharing the same data/query/selection logic.

### 4.4 Related-record / in-page list presentation

Legacy explicitly calls tables such as Visit history, Quote history, Defect history and Contractor lists 「頁內表單」 and standardizes them on `general-table`.

The underlying reusable requirement is broader than a table CSS class:

- a section inside a record page;
- a bounded list of related records;
- optional row selection/actions;
- shared empty/loading/error handling;
- Desktop table presentation and possible Mobile card/list presentation.

CY Web should build a reusable related-record list/data-view component. It does **not** need to keep the Legacy `general-table` appearance or the term 「頁內表單」.

### 4.5 Editable multi-row input list

Legacy documents `input-list-table` and repeats it in Order lines, Quote details, Outsourcing outbound/receiving/pricing lists, WorkLog rows and other screens.

Common behavior includes:

- add/remove row;
- sequence number;
- display mode versus edit mode;
- numeric alignment/formatting;
- lookup fields within a row;
- keyboard navigation;
- optional unit selection;
- validation per row;
- responsive overflow/adaptive presentation.

CY Web should implement one shared editable-list/grid foundation with domain-specific column definitions rather than cloning row-management code in each module.

### 4.6 Entity lookup / autocomplete

Legacy separately implements similar Customer and Item lookups in Order, Quote, Defect, Frequent Item, Outsourcing and other flows:

- exact number lookup;
- debounced name search;
- candidate dropdown;
- selecting an item fills internal ID plus visible fields;
- outside-click dismissal;
- optional linked-record action such as 「查看客戶資料」.

CY Web should provide reusable entity-picker/search-combobox primitives, with Customer and Item adapters/configurations on top.

Internal immutable IDs remain the actual relationship keys; visible business number/name are presentation/search values.

### 4.7 Unit selection / conversion display

Legacy already treats unit dropdown/conversion behavior as a shared convention but implements variations in different modules.

The new system should centralize:

- unit option generation;
- display label generation;
- conversion-to-base calculations where appropriate;
- selected-unit UI behavior.

Domain calculations that depend on a transaction remain in the domain service; generic unit presentation/conversion helpers should not be rewritten in each module.

### 4.8 Form controls and validation presentation

Repeated Legacy patterns include:

- label/field layout;
- disabled/read-only/view/edit presentation;
- required/error state;
- date inputs;
- phone/mobile formatting and validation;
- tax-ID validation;
- auto-growing text areas;
- dynamic phone/contact/address rows;
- dropdown population.

CY Web should implement reusable form primitives and reusable validation/formatting helpers where the rule is genuinely common. Domain-only validation stays in domain code.

### 4.9 Keyboard workflow

Legacy contains several independent Enter-key navigation implementations, including ordinary forms and editable lists.

The new system should make keyboard behavior part of the shared form/editable-list component contract instead of attaching unrelated document-level handlers in each module.

Keyboard behavior must be designed together with accessibility and should not trap focus or override expected browser behavior unnecessarily.

### 4.10 Status / workflow presentation

Order, WorkLog, Defect and Outsourcing repeatedly encode status text, status color/badge presentation and action availability.

CY Web should separate:

- domain transition rules and server authorization;
- a shared status-chip/badge component;
- a shared pattern for workflow action buttons / confirmation;
- module-specific transition definitions.

Do not centralize different business state machines into one fake universal workflow. Reuse presentation and infrastructure, not unrelated domain rules.

### 4.11 Dialog / loading / success / error / empty state

Legacy `js_common.html` already centralizes dialogs and loading overlays, which is the correct architectural direction even though the UX is dated.

CY Web should provide common:

- confirmation dialog;
- destructive confirmation variant;
- Toast / non-blocking success feedback;
- loading/skeleton/progress state;
- field validation error;
- page/section error state;
- empty state.

Business modules should consume these primitives and not create their own modal/toast/loading systems.

### 4.12 Audit/history presentation

Legacy stores and renders operation history in several modules with similar small-text blocks. CY Web already has the shared Audit Core direction from BD-053/054.

The UI side should likewise be shared:

- concise business timeline component for normal record pages;
- detailed Admin/SA Audit Log component;
- one underlying Audit event source, not duplicated module logs.

### 4.13 Desktop/Mobile duplication

Legacy has separate Desktop and Mobile HTML/JS implementations. Customer Desktop and Mobile, for example, duplicate search, form state, validation and record actions while changing presentation from tables to cards/forms.

CY Web must not repeat this architecture. The same business logic/query/validation/state should back Desktop, Tablet and Mobile. Adaptive components may render a table on Desktop and cards/list/sheet on Mobile without duplicating the domain implementation.

## 5. Initial CY Web shared-component / shared-service candidates

These are implementation candidates, not frozen public component names:

| Shared concern | Candidate reusable foundation |
| --- | --- |
| Record create/view/edit lifecycle | `RecordEditor` state/hook/service |
| Unsaved edit blocking | navigation/route/tab dirty guard |
| Standard record actions | shared record action bar with domain-action slots |
| Search + filter + result selection | shared searchable data view |
| Desktop table / Mobile card projection | adaptive data list/table component |
| Related-record sections | shared related-record data view |
| Editable multi-row data | shared editable list/grid |
| Customer / Item lookup | generic entity picker + domain adapters |
| Unit selection | shared unit picker/conversion helpers |
| Form fields | common field/input/select/date/textarea primitives |
| Validation display | common field/error summary pattern |
| Status display | status chip/badge component |
| Dialog/Toast/loading | shared feedback primitives |
| Keyboard row/form navigation | shared accessible key-navigation helper |
| Audit/history | shared timeline + Admin/SA audit viewer |
| API request state | common query/mutation/loading/error wrapper |
| Permission visibility | shared route/action permission guard |

## 6. What should remain module-specific

Shared implementation must not erase real domain differences. Keep these in module/domain code:

- Customer-specific business fields and Customer/Visit/Quote rules;
- Sales Work Order lifecycle and ERP-number business rules;
- Outsourcing stock ledger, receiving, pricing, payment and reversal rules;
- WorkLog scoring/review formulas and workflow;
- Defect lifecycle;
- Item-specific pricing/category/business rules;
- module-specific server authorization and validation.

The shared layer supplies reusable mechanics and UI primitives; domain modules supply business semantics.

## 7. Pre-UI implementation gate

Before the first production business screen is built, the CY Web workstream should complete these steps:

1. Re-check the relevant Legacy module plus this cross-module audit before implementing that module.
2. For every repeated behavior, first decide whether an existing shared primitive covers it.
3. If two modules need materially the same behavior, implement or extend a shared primitive rather than copy/paste a module version.
4. Do not create separate Desktop and Mobile business logic; use Adaptive presentation over the same component/data contract.
5. Do not reproduce a Legacy workaround merely because it exists. Identify the underlying user need first.
6. Module-specific exceptions must remain explicit and minimal rather than forking an entire shared component.

## 8. Specific Legacy behavior that should not be blindly carried forward

Examples of Legacy implementation constraints that are evidence, not new-system requirements:

- manual GAS refresh/update prompts;
- full client-side business dataset caching;
- direct DOM manipulation and global variable namespaces;
- duplicated Desktop/Mobile source trees;
- duplicated per-module state-machine boilerplate;
- inline CSS repeated in templates;
- one-off dropdown implementations for the same entity type;
- blocking alert dialogs for routine success/refresh notifications.

The new system should solve the underlying workflow using the modern CY Web architecture and Design System.

## 9. Working conclusion

The Legacy source confirms that the main risk is not missing one specific component such as 「頁內表單」. The larger risk is rebuilding repeated interaction mechanics independently inside Customer, Order, Item, Outsourcing and WorkLog.

Therefore reusable behavior/UI extraction is a required foundation step before normal business-module UI work. New module implementation should preferentially extend shared primitives, with business-specific code limited to real domain differences.
