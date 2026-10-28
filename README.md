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

正式程式基準為 `main`，版本由根 `VERSION`／`BUILD` 定義（2026-10-28 已核實 **V0.9.47 Build 0** 正式部署，最新狀態以 `TODO.md`／受控 Actions 為準）。

- Frontend：TypeScript + React + Vite，一套程式服務桌機、平板、手機。
- Runtime/API：TypeScript + Cloudflare Workers；same-origin `/api/*`，共用 success/failure envelope + `requestId`。
- Database：Cloudflare D1；schema 由 `migrations/` 的 forward migrations 定義（目前到 0029，含門市顧客訂購與黑名單）。
- Static delivery：Workers Static Assets／SPA fallback，所有請求先經 Worker（HTTPS 轉址與 HSTS）。
- 帳號：CYCloud Identity（CYID）管理帳號、Session 與系統使用權；CY Web 只保存模組權限（Module Access）與業務授權。
- 模組：客戶、商品、瑕疵、銷售工單、叫貨、門市（顧客訂購與黑名單）、委外/代工、工作日誌、人事、ERP 查詢（經公司電腦上的 CYERPAutoQuery 只讀查 SMART ERP）、帳號與權限、異動紀錄、備份管理、CY 程式、我的帳號。
- 備份：D1 → R2（每日）＋ GCS（週三／週日）；手動備份與隔離還原已驗收，自動排程待上線前啟用。
- 部署：合併 main 不會部署；授權後以發布分支 `deploy/cyweb-development` 觸發「CY Web Deploy」，流程與成功判定見 `docs/development/IDENTITY_DEPLOYMENT.md`。

**目前狀態與待辦只看根 `TODO.md`；各版本完成內容見根 `CHANGELOG.md`。** 架構文件不另外維護平行進度表。

## 文件入口

- `docs/architecture/README.md` — architecture/design 文件索引與來源分工。
- `docs/architecture/decisions/README.md` — 已確認 Business Decisions 索引。
- `docs/contracts/cyid/` — CYID shared consumer contract 的 read-only synchronized mirror；內容由 manifest 管理並與 CYID `main` 逐檔驗證。
- `docs/architecture/IDENTITY_ADAPTER.md` — CY Web-specific Identity adapter／Module Access 邊界；不得取代 shared CYID contract。
- `TODO.md` — 唯一 current implementation status / next-work tracker。
- `CHANGELOG.md` — 各版本完成內容與驗收證據。
- `docs/development/work-orders/` — 交由其他執行者實作的版本工作單。
- `docs/handoff/README.md` — 後續新工作交接入口；舊已結案 handoff 已整合至正式架構與版本紀錄，原文／截圖保留於 Git 固定歷史快照；尚在執行或審查的工作單繼續保留於 `docs/development/work-orders/`；已結案工作單的 §8／§9 則保留於 Git 固定歷史快照。
- `docs/development/LOCAL_DEVELOPMENT.md` — 本機開發流程。
- `docs/development/IDENTITY_DEPLOYMENT.md#existing-portal-deployment-gate` — Work 發布指令、main-only 手動入口、來源檢查與部署成功判定；main 合併本身不部署。
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
