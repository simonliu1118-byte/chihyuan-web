# CY Web TODO

本文件只記錄待辦與工程方向，不作永久規則來源。

## Phase 0 — Governance / Public foundation

- [x] 建立 Public `chihyuan-web` 與 `main` 正式基準。
- [x] 舊完整 GAS source／歷史留在 Private `chihyuan-legacy-private`。
- [x] 建立 AITeam Governance 2.0 三層規則骨架。
- [x] 同步 AITeam Common Rules 2.6.0。
- [x] 定義 CY shared visual canonical 邊界與 Web Design System 原則。
- [x] AITeam PR #62 改為納管 `chihyuan-web`。
- [ ] CY Web Governance bootstrap PR 驗證與合併。
- [ ] AITeam PR #62 驗證與合併。

## Phase 1 — Legacy inventory / architecture decision

- [ ] 盤點 Legacy 五大系統：Customer、Order、Outsourcing、WorkLog、Item。
- [ ] 從 Private Legacy 抽出資料模型、ID、狀態、驗證、權限與操作流程，分類為「必須保留／可重構／可淘汰」。
- [ ] 最終確認 frontend 技術棧；目前推薦 TypeScript + React + Vite。
- [ ] 建立 Cloudflare Worker project、環境切分與 health endpoint。
- [ ] 設計 D1 relational schema、indexes、constraints、audit 與 forward migrations。
- [ ] 定義 API contract、error contract、validation schema、pagination/search pattern。

## Phase 2 — Reusable CY Web foundation

- [ ] App Shell／navigation／route guard。
- [ ] CYInvoice Cloud identity adapter／session handling／permission guard。
- [ ] API client／error／loading／retry pattern。
- [ ] Form controls／validation presentation。
- [ ] Data table／mobile cards／filter／search／pagination。
- [ ] Dialog／Drawer／Bottom Sheet／full-screen mobile form patterns。
- [ ] Audit/history UI。
- [ ] RWD + Adaptive 真實 Desktop/Tablet/Mobile 驗收矩陣。

## Phase 3 — Data migration

- [ ] 建立 Google Sheets → D1 可重跑 migration tool。
- [ ] 建立資料筆數、ID、關聯、日期、compound fields、numeric-string 欄位核對報告。
- [ ] 定義 dry-run、正式 cutover、rollback／重新執行策略。

## Phase 4 — Module migration

- [ ] Customer。
- [ ] Item。
- [ ] Order。
- [ ] Outsourcing。
- [ ] WorkLog／Scoring／History Statistics。
- [ ] Settings／Admin。

## Phase 5 — CYCloud Identity

- [ ] 盤點 CYInvoice Cloud 可共用 Workspace／Employee／Credential／Session／OTP／Recovery contract。
- [ ] 定義 CYCloud Identity 與 App-specific permission 邊界。
- [ ] 抽離 CYInvoice-specific naming／routing／schema coupling。
- [ ] CY Web 與 CYInvoice 改為 CYCloud Identity consumers。

## Phase 6 — Cutover

- [ ] Legacy vs Cloud 核心資料與行為對照驗收。
- [ ] Desktop／Tablet／Mobile 真實工作流驗收。
- [ ] 權限／Session／高風險操作驗收。
- [ ] 備份／復原與 migration rollback 演練。
- [ ] 使用者確認正式上線穩定後，再停止／刪除舊 GAS deployment 與 Sheet。
