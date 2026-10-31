# CY Web Architecture Documents

本目錄是 **Chihyuan Enterprise Management System（CY Web）** 的 current architecture/design 文件入口。

它不是第四層治理。永久規則只存在於 repository root 的：

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`

目前實作進度與下一步只由根 `TODO.md` 維護，各版本完成內容在根 `CHANGELOG.md`；本目錄不另外維護一份平行 status/handoff。

## 文件語意與優先順序

治理衝突依正式 Governance 規則處理。對非永久規則的 architecture/product 文件，工作時依下列來源分工判讀：

1. 使用者當前明確決定；
2. 最新適用的 confirmed Business Decision；
3. current specialized architecture/module contract；
4. `CANONICAL_DATA_MODEL.md`／`FINAL_DATA_DICTIONARY.md`／forward migrations；
5. current source 與可重建驗證結果；
6. archive/legacy/preview evidence。

Archive、舊 preview、review backlog、readiness checkpoint、已結案舊 handoff（已移出 active tree，原文見 Git history）或舊 branch metadata 都不能覆蓋較新的 current contract／Business Decision／`main` source。Active tree 不維護 dated Identity handoff；歷史 checkpoint 以 Git history 追溯。

## Current architecture baseline

目前穩定的 architecture baseline：

- 單一 TypeScript + React + Vite Web application，Desktop／Tablet／Mobile 共用一套主要 codebase，以 RWD + Adaptive UI 呈現。
- Cloudflare Workers 是 runtime/API target；D1 是正式 relational database target。
- Integrated React operational runtime 的所有業務模組（客戶、商品、瑕疵、銷售工單、委外/代工、工作日誌、叫貨、門市顧客訂購與黑名單、人事、ERP 查詢）與 Settings/Audit 全部使用 protected Worker API → D1；browser-local business authority 已退休。
- Forward schema source of truth 是 `migrations/`；已套用的 migration 不重寫，後續變更持續使用新的 forward migration。
- **CYCloud Identity** 擁有 Workspace、Employee、Credential、Workspace Role、Identity Admin capability、Application Access、Session、Email verification／OTP／Recovery 與受保護的 Super Admin authority；CY Web 只保存 app-local Module Access 與 domain authorization。
- Shared CYID consumer contract 以 `../contracts/cyid/` 的 read-only synchronized mirror 作本 repo 工作副本；Governance/Deploy 逐檔對照 CYID `main`，canonical authority 仍在 CYID。
- Workspace Role 固定為 `SUPER_ADMIN / ADMIN / USER` 並由 CY Web 直接採用；Identity Admin 是 ADMIN capability，不是第四種角色。Identity Group APIs／projection fields 已退休；歷史實體資料只作 migration/history，不是 authorization source。
- CY Web 不保存 Identity session row；只在 HttpOnly cookie 中傳輸 CYCloud Identity 的 opaque session token，並在後續請求重新向 Identity resolve。
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
- `../contracts/cyid/` — synchronized shared CYID Consumer Integration Standard / Auth / Role / Architecture package。
- `IDENTITY_ADAPTER.md` — CY Web-specific Identity adapter、Module Access split and provider acceptance contract。
- `COMPATIBILITY_REVIEW.md` — source/deployment evidence、obsolete compatibility paths and cleanup order; not a new contract or progress tracker。
- `AUDIT_CORE.md` — Audit service/query boundary。
- `OPERATIONAL_RUNTIME.md` — single React → protected Worker API → D1 runtime boundary。

### Shared Web UI foundations

- `CY_WEB_VISUAL_GUIDE.md` — 志遠網頁程式標準視覺規範（字型、顏色、狀態語意、元件、載入、鍵盤、響應式、驗收）；canonical 候選，確認後升格至 AITeam `shared/cy-visual/web/`。
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

- `STORE_STOCKTAKE.md` — 門市庫存盤點（V0.9.52、盲盤／複盤／ERP 寫回與第二階段保留資料邊界）。

- `CUSTOMER_MODULE_CONTRACT.md`
- `CUSTOMER_SERVICE_FOUNDATION.md`
- `CUSTOMER_RELATED_FOUNDATION.md`
- `CUSTOMER_UI_COMPOSITION.md`
- `CUSTOMER_EDIT_INTERACTION.md`
- `CUSTOMER_RELATED_UI.md`
- `ERP_ITEM_QUERY_BRIDGE_CONTRACT.md` — ERP 查詢（商品、客戶、供應商、進貨輔助、未收款、排程佇列）、CYERPAutoQuery Agent 佇列、憑證、ERP 關閉／暫停與短期資料契約；開頭有目前狀態總覽。
- `ITEM_MODULE_CONTRACT.md`
- `DEFECT_MODULE_CONTRACT.md`
- `SALES_WORK_ORDER_MODULE_CONTRACT.md`
- `CONTRACTOR_OUTSOURCING_MODULE_CONTRACT.md`
- `WORK_LOG_MODULE_CONTRACT.md`
- `SETTINGS_ADMIN_MODULE_CONTRACT.md`
- `ORDERING_MODULE.md` — 叫貨（草稿、送出、修改、到貨、廠商頁、可攜備份）。
- `STORE_CUSTOMER_ORDERS.md` — 門市顧客訂購／黑名單、手動進度日期、逐筆歷程與三選一聯絡方式。叫貨連動仍為 TODO，不是現有能力。
- `STORE_MONTHLY_TODOS.md` — 門市月度待辦、月份生效區間、管理員設定、獨立日期／無日期辦理、補漏排程與可攜備份。
- `HR_MODULE_DESIGN.md`、`HR_MODULE_CONTRACT.md` — 人事（主檔、排班出勤、請假特休加班補休）；`HR_LEGAL_WATCH.md` 為每月法規檢查。

Module contract 與適用的最新 Business Decisions 共同定義業務語意；不要從歷史 preview 反推 current business rule。

### Infrastructure / deployment

- `BACKUP_ARCHITECTURE.md` — provider-neutral tiered backup/recovery architecture。
- `CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md` — Public source 與 production infrastructure boundary。
- `../DOMAIN_STRATEGY.md` — Chihyuan parent-domain namespace、security boundary、rollout sequence。
- `../development/LOCAL_DEVELOPMENT.md` — local development workflow。
- `../development/IDENTITY_DEPLOYMENT.md` — CYCloud Identity development deployment and browser acceptance path；也是 CY Web 發布（`deploy/cyweb-development`）的操作文件。
- `../development/work-orders/` — 版本工作單（格式見該目錄 `README.md`）。

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
Worker/API + CYCloud Identity adapter + Audit Core
        ↓
shared UI foundations
        ↓
module services/contracts
        ↓
real integrated React operational runtime
        ↓
local/dev D1 + Worker acceptance
        ↓
CYCloud Identity concrete browser-session integration
        ↓
single React application → protected Worker API → D1
        ↓
Desktop/Tablet/Mobile acceptance
        ↓
controlled production rollout
```

不要因 UI layout 調整而重開已定案的資料語意；也不要因 archive 中仍存在舊 `OPEN`／preview 設計就重新詢問已由 Business Decision 解決的問題。
