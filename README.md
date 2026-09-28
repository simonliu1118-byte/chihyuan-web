# Chihyuan Enterprise Management System

**CY Web** — 志遠企業管理系統的新一代全 Web 專案。

本 repository 為 **Public、source-visible proprietary**；原始碼可閱讀，但未授予開源使用、修改、散布或再授權權利，正式授權以根 `LICENSE` 為準。

## 產品方向

- 單一 Web application，服務 Desktop／Tablet／Mobile。
- RWD 作共同 layout 基礎，Mobile 另採 Adaptive UI；不維護 Desktop／Mobile 兩套網站。
- Desktop 維持高資訊密度與鍵盤效率；Mobile 依觸控/快速輸入情境採適合的 Adaptive presentation。
- 目標 Cloud 平台為 Cloudflare；舊 GAS／Google Sheets 只作功能、行為與資料語意參考，其未投入使用的測試資料不搬入正式 D1。
- 新版 UI/UX 會重新設計，不需保留 GAS 技術限制或舊式資料刷新提示。
- 現階段帳號先重用既有 Shared Identity 相容能力，中期再依規劃抽離為 CYCloud Identity。

## 目前工程基礎

目前 foundation 使用：

- Frontend：TypeScript + React + Vite。
- Runtime/API：TypeScript + Cloudflare Workers。
- Vite/Workers integration：Cloudflare Vite plugin。
- Database：Cloudflare D1。
- Static delivery：Workers Static Assets / SPA fallback。
- API：same-origin `/api/*`，共用 success/failure envelope + `requestId`。

目前 forward migration chain：

- `migrations/0001_initial.sql`
- `migrations/0002_defect_invalidation.sql`

目前實際瀏覽器測試面是整合後的 React operational runtime，暫以 versioned browser `localStorage` 作 persistence adapter。正式 schema freeze 仍待 local/dev Cloudflare D1 migration 與 Worker/D1 runtime smoke acceptance；正式 production D1 尚未由目前 `0.1.39` main baseline 寫入。

目前續作 checkpoint 見 `docs/handoffs/CYWEB_MAIN_BASELINE_HANDOFF_2026-09-28.md`。

本機開發流程見 `docs/development/LOCAL_DEVELOPMENT.md`。

## 資料與備份方向

- Cloudflare D1 是正式 live database。
- Cloudflare R2 是日常 operational backup tier：每日備份、短期保留、正常還原優先來源。
- Google Cloud Storage 是 cross-cloud disaster recovery tier：較低頻率複寫、較長保留。
- R2 與 GCS 共用同一 portable backup set／manifest／SHA-256 verification；同一 logical backup 不為不同 provider 重複 export D1。
- CY Web 與 CYAccountingWeb 共用 backup outer contract/provider boundary；dataset / credential 維持隔離。

詳見 `docs/architecture/BACKUP_ARCHITECTURE.md`。

## Legacy

舊完整 GAS prototype 與 Git 歷史保留於 Private `chihyuan-legacy-private`，不 mirror 進本 Public repository。Legacy Desktop + shared backend 主要用來理解既有功能與流程，不作 production data migration contract，也不作新版 Web UI 外觀基準。

## Architecture docs

接續架構／實作前優先讀：

1. `docs/handoffs/CYWEB_MAIN_BASELINE_HANDOFF_2026-09-28.md`
2. `docs/architecture/README.md`
3. `docs/architecture/decisions/README.md`
4. `docs/architecture/CANONICAL_DATA_MODEL.md`
5. `docs/architecture/FINAL_DATA_DICTIONARY.md`
6. `docs/architecture/D1_SCHEMA_REVIEW.md`
7. `docs/architecture/API_CONTRACT.md`
8. `docs/architecture/BACKUP_ARCHITECTURE.md`（若涉及 backup/recovery/storage）
9. `TODO.md`

## Governance

接手工作前依序讀：

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`
4. `docs/handoffs/CYWEB_MAIN_BASELINE_HANDOFF_2026-09-28.md`
5. `docs/architecture/README.md`
6. `docs/architecture/decisions/README.md`
7. `TODO.md` 與本次工作相關 source／design docs

AITeam `main` 是 Common Rules 與 CY family shared visual 的 canonical source；CY Web 不自動套用 Windows Desktop Visual Guide 作 Web UI 規格。
