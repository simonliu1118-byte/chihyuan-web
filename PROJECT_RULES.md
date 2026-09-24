# Chihyuan Enterprise Management System Project Rules

本文件只記錄 **Chihyuan Enterprise Management System（CY Web）** 的永久產品規則。共通規則依根 `REPOSITORY_RULES.md`；repo-specific 規則依根 `REPO_POLICY.md`。

## 1. 產品定位

- 本專案是 **純 Web 企業管理系統**，主要使用情境為 Desktop／Tablet／Mobile browser。
- 不建立 Windows 桌面版、EXE、桌面殼或以桌面 UI 為主體的第二產品線，除非使用者未來另行明確決定。
- 舊 Google Apps Script／Google Sheets 系統只作遷移來源與行為參考；新正式系統的架構與 UI 不需維持 GAS 技術限制。
- 主要業務範圍包含 Customer、Order、Item、Outsourcing、WorkLog／Scoring、Settings／Admin，未來可依相同架構擴充企業管理模組。

## 2. Legacy 基準

- 舊完整 GAS source 保留於 Private `chihyuan-legacy-private`，本 Public repo 不保存其完整 mirror。
- Legacy 是 migration/reference baseline，不再作新功能主線；除非使用者明確要求緊急維護舊系統，不在 Legacy 繼續擴充正常新功能。
- 遷移時需保留必要資料語意、ID 規則、狀態、驗證、權限與操作流程；不得因重寫而無理由改變既有資料意義。
- 從 Legacy 抽取進本 repo 的文件／fixture 必須先去除秘密、真實個資、Script ID、本機設定與不必要營運資料。

## 3. Cloud 與資料層方向

- 目標平台為 Cloudflare；新 backend 不延續 GAS 作正式主後端。
- 正式資料與 API 必須有 server-side validation、permission boundary、migration／schema source of truth 與 auditability；不得只依賴前端驗證。
- Google Sheets → 新資料層必須有可重跑、可核對、可回溯的 migration 流程；不得直接手動搬資料後宣稱完成。
- 具體 frontend framework、database 或 Cloudflare service 組合在使用者正式定案前屬工程規劃；可先記錄於 README／TODO／設計文件，不得只因技術推薦就默默升格為永久規則。

## 4. RWD + Adaptive UI

- 前端只維護 **單一網站、單一主要前端 codebase**，不建立獨立 Desktop 網站與 Mobile 網站兩套長期 source。
- RWD 是共同 layout 基礎；Mobile **不得只把 Desktop 等比例縮小或單純換行**，必須依使用情境做 Adaptive UI。
- 相同資料與功能在不同裝置可採不同 presentation，但資料語意、權限、validation、API contract 與操作結果必須一致。
- Desktop 以高資訊密度、快速查詢、多欄位同時可見與鍵盤效率為優先。
- Mobile 以查詢、確認、快速輸入、簡單修改與觸控操作為優先；可使用 Drawer、卡片化資料、單欄表單、較大 touch target、Bottom Sheet／全螢幕 Modal 等 presentation。
- Tablet 依實際畫面介於 Desktop 與 Mobile 間調整；Breakpoint 是實作工具而非固定產品規則。

## 5. Web Design System

- CY Web 不以 WinForms／Win32 外觀作 Web UI 標準，也不要求與 CY Desktop Visual Guide 視覺相同。
- 可建立適合企業 Web App 的獨立 Web Design System，包括 color tokens、spacing、typography、form、table/list、dialog/sheet、navigation、responsive pattern、interaction states 與 accessibility。
- Desktop 與 Mobile 應屬同一產品視覺語言；Mobile 可以有專用元件變體與 layout，不視為第二套網站。
- AITeam `shared/cy-visual/` 仍是 family-wide visual canonical source；若未來建立正式 Web canonical package，本專案依治理鏈採用並保留必要 project-specific 例外。

## 6. 共用模板與一致性

- 重複性高的 Web 基礎能力優先抽成共用 component／template／service，例如 App Shell、navigation、auth client、permission guard、API client、error/loading state、form controls、table/list、search、dialog/sheet、audit UI、responsive patterns。
- Customer、Order、Item、Outsourcing、WorkLog 等模組優先延伸既有 shared component／service／schema，不建立功能等價但互不相容的第二套實作。
- 共用模板不得把單一模組特殊業務硬塞成全域規則；真正特殊需求維持最小 scope。

## 7. 帳號與 CYCloud Identity

- 現階段 CY Web 先重用 **CYInvoice Cloud 既有帳號能力**，包含相容的 Workspace／Employee／Credential／Session／OTP／Recovery contract。
- CY Web 必須透過清楚的 auth／identity adapter 或 service boundary 使用既有帳號能力，避免在 UI、domain model 或 business module 中擴大 CYInvoice-specific 耦合。
- 中期目標是把共用身分能力從 CYInvoice Cloud 抽離為 **CYCloud Identity**，供 CYInvoice、CY Web、CYAccounting Web 與未來 Cloud App 共用。
- App-specific permission 由各 App 定義；共用 Identity 不應把單一 App 的全部細部 permission 永久寫死成全域角色。

## 8. 遷移與驗收

- GAS → Cloudflare、Google Sheets → 新資料層、Desktop/Mobile 雙前端 → 單一 RWD + Adaptive UI，不得一次無驗收地大爆炸切換。
- 遷移採可分階段驗證方式；每階段需能比對 Legacy 行為／資料，並確認 rollback／重新執行策略後再進下一階段。
- 正式 cutover 前至少需完成資料筆數／關聯／關鍵欄位核對、權限流程、主要 CRUD、重要計算／狀態、Desktop 與 Mobile 真實操作驗收。
- 使用者確認 CY Web 測試與上線穩定後，才停止／刪除舊 GAS deployment 與 Sheet；在此前不得因 Public repo 遷移而擅自破壞舊測試環境。
