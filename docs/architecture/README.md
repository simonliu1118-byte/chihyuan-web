# CY Web Architecture Documents

本目錄是 **Chihyuan Enterprise Management System（CY Web）** 的 current architecture/design 文件入口。

它不是第四層治理。永久規則只存在於 repository root 的：

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`

目前實作進度與下一步只由根 `TODO.md` 維護；本目錄不另外維護一份平行 status/handoff。

## 文件語意與優先順序

治理衝突依正式 Governance 規則處理。對非永久規則的 architecture/product 文件，工作時依下列來源分工判讀：

1. 使用者當前明確決定；
2. 最新適用的 confirmed Business Decision；
3. current specialized architecture/module contract；
4. `CANONICAL_DATA_MODEL.md`／`FINAL_DATA_DICTIONARY.md`／forward migrations；
5. current source 與可重建驗證結果；
6. archive/legacy/preview evidence。

Archive、舊 preview、review backlog、readiness checkpoint、handoff 或舊 branch metadata 都不能覆蓋較新的 current contract／Business Decision／`main` source。

## Current architecture baseline

目前穩定的 architecture baseline：

- 單一 TypeScript + React + Vite Web application，Desktop／Tablet／Mobile 共用一套主要 codebase，以 RWD + Adaptive UI 呈現。
- Cloudflare Workers 是 runtime/API target；D1 是正式 relational database target。
- 現階段 integrated React operational runtime 使用 versioned browser `localStorage` 作暫時 persistence adapter；這不是第二套 domain model。
- Forward schema source of truth 是 `migrations/`；正式 schema freeze 尚待 local/dev D1 + Worker acceptance。
- Shared Identity 擁有 credential/session/shared-role authority；CY Web 只保存 app-local access projection 與 domain authorization。
- API 使用 same-origin `/api/*`，server-side validation/authorization 才是權威。
- 一個 shared Audit Core 記錄需要追溯的重要業務動作。
- Production infrastructure metadata/credentials 不進 Public source；runtime/deployment 透過受控 binding/secret boundary 注入。
- Backup target architecture 是 D1 live → R2 operational recovery tier → GCS cross-cloud DR tier；同一 logical backup 只 export D1 一次。

最新 implementation status、尚未完成的 gate 與工作順序：讀根 `TODO.md`。

## Architecture map

### Decisions

- `BUSINESS_DECISIONS.md` — 早期已整併的 confirmed Business Decisions。
- `decisions/README.md` — current Business Decision index、supersession/refinement map。
- `decisions/BD-019.md` onward — 後續逐項 Business Decisions。

### Data / API / runtime

- `CANONICAL_DATA_MODEL.md` — current logical data model。
- `FINAL_DATA_DICTIONARY.md` — current relational/physical dictionary baseline。
- `D1_SCHEMA_REVIEW.md` — D1 schema validation/freeze gate。
- `API_CONTRACT.md` — Worker API envelope、errors、validation、concurrency。
- `REQUEST_FOUNDATION.md` — shared browser request/client boundary。
- `IDENTITY_ADAPTER.md` — Shared Identity / CY Web authorization split and provider acceptance contract。
- `AUDIT_CORE.md` — Audit service/query boundary。
- `OPERATIONAL_LOCAL_RUNTIME.md` — localStorage operational runtime adapter/cutover contract。

### Shared Web UI foundations

- `UI_FOUNDATION.md`
- `APP_SHELL_FOUNDATION.md`
- `FORM_FOUNDATION.md`
- `DATA_VIEW_FOUNDATION.md`
- `ENTITY_PICKER_FOUNDATION.md`
- `EDITABLE_LIST_FOUNDATION.md`
- `OVERLAY_FEEDBACK_FOUNDATION.md`
- `KEYBOARD_ENTRY_FOUNDATION.md`

這些文件描述 reusable foundation；module-specific business semantics 不應反向寫成 global UI 規則。

### Business modules

- `CUSTOMER_MODULE_CONTRACT.md`
- `CUSTOMER_SERVICE_FOUNDATION.md`
- `CUSTOMER_RELATED_FOUNDATION.md`
- `CUSTOMER_UI_COMPOSITION.md`
- `CUSTOMER_EDIT_INTERACTION.md`
- `CUSTOMER_RELATED_UI.md`
- `ITEM_MODULE_CONTRACT.md`
- `DEFECT_MODULE_CONTRACT.md`
- `SALES_WORK_ORDER_MODULE_CONTRACT.md`
- `CONTRACTOR_OUTSOURCING_MODULE_CONTRACT.md`
- `WORK_LOG_MODULE_CONTRACT.md`
- `SETTINGS_ADMIN_MODULE_CONTRACT.md`

Module contract 與適用的最新 Business Decisions 共同定義業務語意；不要從歷史 preview 反推 current business rule。

### Infrastructure / deployment

- `BACKUP_ARCHITECTURE.md` — provider-neutral tiered backup/recovery architecture。
- `CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md` — Public source 與 production infrastructure boundary。
- `../DOMAIN_STRATEGY.md` — Chihyuan parent-domain namespace、security boundary、rollout sequence。
- `../development/LOCAL_DEVELOPMENT.md` — local development workflow。

## Historical evidence / archive

`archive/` 保存已被 current implementation/contracts 取代、但仍可能有追溯價值的：

- pre-consolidation architecture snapshots；
- Legacy behavior/audit evidence；
- standalone workspace previews；
- completed readiness reviews；
- historical UI review backlog；
- superseded rollout notes。

這些檔案不是 current architecture source。需要追溯時才讀，日常實作不應把它們和 current contracts 並列載入。

## Current implementation chain

```text
confirmed Business Decisions
        ↓
Canonical Data Model / Final Data Dictionary / migrations
        ↓
Worker/API + Identity adapter + Audit Core
        ↓
shared UI foundations
        ↓
module services/contracts
        ↓
real integrated React operational runtime
        ↓
local/dev D1 + Worker acceptance
        ↓
initial schema freeze
        ↓
Shared Identity concrete browser-session integration
        ↓
localStorage adapter → protected Worker API → D1
        ↓
Desktop/Tablet/Mobile acceptance
        ↓
controlled production rollout
```

不要因 UI layout 調整而重開已定案的資料語意；也不要因 archive 中仍存在舊 `OPEN`／preview 設計就重新詢問已由 Business Decision 解決的問題。
