# CY Web Customer UI Composition — First Review Draft

> Status: first Customer visual-composition review draft.
>
> This document defines the first **new-Web** information architecture for Customer. It is intentionally not a reproduction of the Legacy GAS screen, and it does not freeze final colors, typography, spacing, or all Tablet/Mobile details.

## 1. Design intent

Customer is the first real CY Web business screen and therefore sets the reusable master-record pattern for later Item, Contractor and related modules.

The first composition should optimize for:

- fast office search and selection;
- high information density without the old desktop-form appearance;
- clear separation between identity/ownership data and contact/address details;
- related records available in context without forcing every history dataset to load at once;
- one shared data/interaction model that can adapt to Tablet/Mobile later;
- keyboard efficiency where it is useful;
- visible status and save state without routine blocking dialogs.

Legacy Customer remains workflow evidence only. Useful field grouping and workflow knowledge may be retained, but the tab strip, fixed-width form rows, old button placement and GAS-specific loading/refresh behavior are not carried forward as layout requirements.

## 2. Desktop workspace model

The first Desktop composition uses a **search-and-detail workspace** rather than a sequence of independent Legacy tabs.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Page title: 客戶管理                              [新增客戶]         │
│ Search / filters / result count                                      │
├───────────────────────┬──────────────────────────────────────────────┤
│ Customer result list  │ Selected Customer                            │
│                       │ header / identity / status / actions          │
│ no. / short name      ├──────────────────────────────────────────────┤
│ category / region     │ Overview                                     │
│ owner / status        │  基本資料       負責資訊                       │
│                       │  電話/傳真      聯絡人                         │
│                       │  地址           重要備註                       │
│                       ├──────────────────────────────────────────────┤
│                       │ Related records                               │
│                       │ [拜訪] [報價] [常用品] [動態/歷史]             │
│                       │ bounded list loaded on demand                 │
└───────────────────────┴──────────────────────────────────────────────┘
```

The exact left/right width ratio remains provisional and should be tuned in browser review.

## 3. Search and result area

Desktop keeps Customer search visible while a record is open.

Initial search/filter controls:

- keyword;
- category;
- status;
- region;
- owner department / employee when useful;
- result count;
- explicit clear/reset action.

The result list is a compact `DataView` projection. It should prioritize the fields useful for recognition rather than reproducing the Legacy 11-column search table.

Recommended first-row emphasis:

1. Customer short name;
2. Customer number when assigned;
3. status;
4. category / region;
5. responsible employee or department;
6. optional Tax ID secondary text when useful.

Phone, contact and address do not need permanent full-width columns in the main result list. They remain searchable/detail information when later usage proves that cross-field search is needed.

## 4. Customer detail header

The selected Customer header should make identity and current state immediately scannable:

- short name as the primary title;
- full name as secondary identity text when present;
- Customer number if assigned, otherwise a clear `尚未建立 ERP 客戶編號` state;
- status chip;
- category / region summary;
- current owner summary;
- last-updated metadata kept secondary;
- action area for `修改` and other allowed actions.

Technical `customers.id` is not shown to normal users.

Create mode uses the same detail surface rather than opening an unrelated full-screen Legacy-style form.

## 5. Profile sections

The first Desktop detail uses semantic sections rather than one long fixed-width row form.

### A. 基本資料

- Customer number;
- short name;
- full name;
- Tax ID;
- category;
- status.

### B. 負責資訊

- geographic region;
- owner department;
- owner employee.

Geographic region remains separate from individual addresses.

### C. 聯絡方式

- phone rows;
- fax;
- contacts.

Phone and Contact repeated rows use shared editable-list mechanics in edit mode. View mode should render compact readable values rather than disabled inputs everywhere.

### D. 地址

Addresses are repeated rows with postal code, address and note.

Editing an address never silently changes Customer region. A future address parser may offer a suggestion only.

### E. 重要備註

Important notes are visible in normal Customer context and must not be hidden behind a special Legacy-only settings modal. Their final visual emphasis should distinguish genuinely important information without making the whole screen visually noisy.

## 6. View mode versus edit mode

CY Web should not imitate the Legacy pattern of rendering every field as disabled input controls during normal viewing.

### View mode

- use readable label/value presentation;
- show empty values deliberately and quietly;
- repeated data is rendered as compact rows/cards;
- primary actions remain obvious;
- no disabled-input visual clutter.

### Edit/create mode

- switch relevant sections to shared form primitives;
- retain the same information hierarchy and screen location where practical;
- use shared record-editor dirty detection;
- `儲存` / `取消` use the shared action pattern;
- field errors appear inline;
- successful save uses non-blocking feedback;
- revision conflict uses the shared 409/conflict handling rather than silent overwrite.

## 7. Related-record area

Visits, Customer+Item Quote history and Frequent Items are contextual Customer data, but are not part of the Customer-detail payload.

The first Desktop composition keeps them in a dedicated related-record area below or beside the main profile according to viewport width.

Initial navigation labels:

- 拜訪紀錄;
- 報價紀錄;
- 常用商品;
- 動態 / 歷史 when the concise Audit timeline becomes available.

Only the selected related section is queried on demand. Switching related sections does not reload the Customer master or whole application.

The old term `頁內表單` is not used as the new component identity.

## 8. Add/edit action behavior

- `新增客戶` is a page-level primary action.
- selecting a Customer opens it in the detail workspace without losing the current search state.
- `修改` is record-level.
- hard delete is shown only when the server confirms the Customer is never-used/deletable.
- Customer-number correction is a controlled meaningful action when it exists, not an ordinary silent field overwrite.
- duplicate Tax ID warning uses the shared confirmation/notice pattern and explicit acknowledgement contract.

## 9. Responsive direction

This draft reviews Desktop first, but the structure must remain adaptable.

### Tablet

Likely direction:

- result list may narrow or collapse;
- detail remains the main workspace;
- related records become stacked sections or a local sub-navigation.

### Mobile

Likely direction:

- search/results and detail become sequential views over the same query/selection state;
- profile sections become stacked cards/sections;
- editing may use full-screen or Bottom Sheet patterns depending on field density;
- no separate Mobile business implementation.

These are direction only; final Tablet/Mobile composition is reviewed after the Desktop information hierarchy is accepted.

## 10. Explicit differences from Legacy GAS

Do not reproduce by default:

- top-level tabs for `搜尋結果 / 客戶主檔 / 拜訪 / 報價 / 常用品` as separate application states;
- the wide 11-column Customer search table as the only result presentation;
- every view field displayed as a disabled input;
- fixed pixel-width form rows copied from the old HTML;
- separate per-tab Customer header boxes repeating the same identity fields;
- blocking success/update/refresh dialogs;
- loading all Customer-related records with the master by default;
- separate Desktop and Mobile business logic.

Useful Legacy behavior retained/adapted:

- fast Customer search and selection;
- visible Customer identity while working with related records;
- efficient repeated phones/contacts/addresses;
- inline access to Visits, Quote history and Frequent Items;
- strong duplicate Tax-ID warning;
- keyboard efficiency where appropriate.

## 11. First implementation-preview boundary

The first React preview may use static Customer sample data only to validate composition against the shared UI foundation.

It must not:

- expose unauthenticated production Customer routes;
- invent production data;
- bind production D1;
- freeze final visual tokens;
- imply that the current preview is accepted final UI.

After composition review, the same surface becomes the target for the protected Customer search/detail/create/update implementation once Identity and local/dev Worker+D1 runtime gates are cleared.
