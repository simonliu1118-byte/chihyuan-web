# Chihyuan Enterprise Management System

**CY Web** — 志遠企業管理系統的新一代全 Web 專案。

本 repository 為 **Public、source-visible proprietary**；原始碼可閱讀，但未授予開源使用、修改、散布或再授權權利，正式授權以根 `LICENSE` 為準。

## 產品方向

- 單一 Web application，服務 Desktop／Tablet／Mobile。
- RWD 作共同 layout 基礎，Mobile 另採 Adaptive UI；不維護 Desktop／Mobile 兩套網站。
- Desktop 維持高資訊密度與鍵盤效率；Mobile 可使用卡片、Drawer、單欄表單、Bottom Sheet／全螢幕流程等呈現。
- 目標 Cloud 平台為 Cloudflare；舊 GAS／Google Sheets 只作功能／行為／資料語意參考，其未投入使用的測試資料不搬入正式 D1。
- 現階段帳號先重用 CYInvoice Cloud 既有相容能力，中期抽離為 CYCloud Identity。

## 資料與備份方向

- Cloudflare D1 是正式 live database。
- Cloudflare R2 是日常 operational backup tier：每日備份、短期保留、正常還原優先來源。
- Google Cloud Storage 是 cross-cloud disaster recovery tier：較低頻率複寫、較長保留。
- R2 與 GCS 共用同一 portable backup set／manifest／SHA-256 verification；同一 logical backup 不為不同 provider 重複 export D1。
- CY Web 與 CYAccountingWeb 採同一 `BackupService / BackupStorageProvider` 架構，但 dataset / credential 必須隔離；未來優先收斂為共用 `CY Backup Service / Worker`。

詳見：

- `docs/architecture/BACKUP_ARCHITECTURE.md`
- `docs/architecture/decisions/BD-049.md`
- `docs/architecture/decisions/BD-050.md`

## Legacy

舊完整 GAS prototype 與 Git 歷史保留於 Private `chihyuan-legacy-private`，不 mirror 進本 Public repository。Legacy Desktop + shared backend 主要用來理解既有功能與流程，不作 production data migration contract。

## 目前推薦工程方向

此段屬工程規劃，不取代 `PROJECT_RULES.md`：

- Frontend：TypeScript + React + Vite。
- Backend：TypeScript + Cloudflare Workers。
- Database：Cloudflare D1。
- Static delivery：Cloudflare Workers Static Assets。
- Contract／validation：共享 TypeScript schema，server-side validation 為權威。

## Architecture docs

接續架構／實作前優先讀：

1. `docs/architecture/README.md`
2. `docs/architecture/decisions/README.md`
3. `docs/architecture/CANONICAL_DATA_MODEL.md`
4. `docs/architecture/BACKUP_ARCHITECTURE.md`（若工作涉及 backup/recovery/storage）
5. `TODO.md`

## Governance

接手工作前依序讀：

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`
4. `TODO.md` 與本次工作相關 source／design docs

AITeam `main` 是 Common Rules 與 CY family shared visual 的 canonical source；CY Web 不自動套用 Windows Desktop Visual Guide 作 Web UI 規格。
