# Chihyuan Enterprise Management System

**CY Web** — 志遠企業管理系統的新一代全 Web 專案。

本 repository 為 **Public、source-visible proprietary**；原始碼可閱讀，但未授予開源使用、修改、散布或再授權權利，正式授權以根 `LICENSE` 為準。

## 產品方向

- 單一 Web application，服務 Desktop／Tablet／Mobile。
- RWD 作共同 layout 基礎，Mobile 採 Adaptive UI；不維護 Desktop／Mobile 兩套網站。
- Desktop 以資訊密度、快速查詢與鍵盤效率為優先；Mobile 依觸控、查詢、確認與快速輸入情境調整 presentation。
- 目標 Cloud 平台為 Cloudflare；舊 GAS／Google Sheets 僅作功能、資料語意與操作行為參考，未投入使用的測試資料不搬入正式 D1。
- 帳號能力透過 Shared Identity 邊界重用，CY Web 不建立第二套 credential/session authority。

## 目前工程基礎

正式程式基準為 `main`，版本由根 `VERSION`／`BUILD` 定義。目前基礎包含：

- Frontend：TypeScript + React + Vite。
- Runtime/API：TypeScript + Cloudflare Workers。
- Database target：Cloudflare D1。
- Static delivery：Workers Static Assets / SPA fallback。
- API：same-origin `/api/*`，共用 success/failure envelope + `requestId`。
- Forward migrations：`migrations/0001_initial.sql`、`migrations/0002_defect_invalidation.sql`。

目前實際功能／UI 測試面是整合後的 React operational runtime，暫以 versioned browser `localStorage` 作 persistence adapter。這只是 D1 cutover 前的暫時 runtime adapter，不是第二套 domain model。

**目前工作狀態與下一步只看根 `TODO.md`。** 架構文件不另外維護一份平行進度表。

## 文件入口

- `docs/architecture/README.md` — architecture/design 文件索引與來源分工。
- `docs/architecture/decisions/README.md` — 已確認 Business Decisions 索引。
- `docs/contracts/cyid/` — CYID shared consumer contract 的 read-only synchronized mirror；內容由 manifest 管理並與 CYID `main` 逐檔驗證。
- `docs/architecture/IDENTITY_ADAPTER.md` — CY Web-specific Identity adapter／Module Access 邊界；不得取代 shared CYID contract。
- `TODO.md` — 唯一 current implementation status / next-work tracker。
- `docs/development/LOCAL_DEVELOPMENT.md` — 本機開發流程。
- `docs/DOMAIN_STRATEGY.md` — Chihyuan Web systems 的 domain namespace／rollout architecture。
- `docs/architecture/BACKUP_ARCHITECTURE.md` — R2 + GCS backup/recovery architecture。

歷史 preview、audit、readiness、review checkpoint 收在 `docs/architecture/archive/` 或 Git history，只作追溯，不作 current implementation source。Active tree 不再維護 dated Identity handoff；consumer handoff 只在 shared contract 驗收後針對目標工作線產生。

## Governance

接手工作前依共同治理順序讀取：

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`
4. `docs/architecture/README.md`
5. `docs/architecture/decisions/README.md`
6. `TODO.md` 與本次工作真正相關的 source／design docs

`AGENTS.md` 只提供 AI 入口索引，不新增規則。README、TODO、architecture、Business Decision、archive 或 handoff 都不是第四層永久規則來源。

AITeam `main` 是 Common Rules 與 CY family shared visual 的 canonical source；CY Web 不自動套用 Windows Desktop Visual Guide 作 Web UI 規格。

## Legacy

舊完整 GAS prototype 與 Git 歷史保留於 Private `chihyuan-legacy-private`，不 mirror 進本 Public repository。Legacy Desktop + shared backend 主要用來理解既有功能與流程，不作 production data migration contract，也不作新版 Web UI 外觀基準。
