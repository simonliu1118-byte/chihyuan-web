# Chihyuan Enterprise Management System Project Rules

本文件只記錄 **Chihyuan Enterprise Management System（CY Web）** 的永久產品規則。共通規則依根 `REPOSITORY_RULES.md`；repo-specific 規則依根 `REPO_POLICY.md`。

## 1. 產品定位

- 本專案是純 Web 企業管理系統，主要使用情境為 Desktop／Tablet／Mobile browser。
- 不建立 Windows 桌面版、EXE、桌面殼或以桌面 UI 為主體的第二產品線，除非使用者未來另行明確決定。
- 舊 Google Apps Script／Google Sheets 系統只作功能、資料語意與操作行為參考；新正式系統的架構與 UI 不需維持 GAS 技術限制。
- 舊 GAS／Google Sheets 尚未投入正式使用；其現有測試／開發資料不屬於 CY Web 正式上線必須搬移的 production data。新 CY Web production database 以乾淨 canonical schema 起始。
- 主要業務範圍包含 Customer、Order、Item、Outsourcing、WorkLog／Scoring、Settings／Admin，未來可依相同架構擴充企業管理模組。

## 2. Legacy 基準

- 舊完整 GAS source 保留於 Private `chihyuan-legacy-private`，本 Public repo 不保存完整 mirror。
- Legacy 是 behavior/reference baseline，不再作新功能主線；除非使用者明確要求緊急維護舊系統，不在 Legacy 繼續擴充正常新功能。
- 最新使用者明確決策與已確認 CY Web Business Decisions 優先於 Legacy 行為；Legacy Desktop + shared backend 是舊行為主要參考，未完成的 Legacy Mobile 僅作補充證據。
- 不為目前 Legacy 測試資料建立 production Google Sheets → D1 importer、`legacy_id_map`、資料 cutover reconciliation 或其他僅為搬移未投入使用測試資料而存在的 production 相容層，除非使用者未來另行明確決定。
- 從 Legacy 抽取進本 repo 的文件／fixture 必須先做 Public-safe 資料最小化，不得帶入正式識別資訊、真實個資、機密設定或不必要營運資料。
- Legacy 歷史 audit／draft 可保留作追溯，但不得凌駕較新的 Business Decision／current architecture document。

## 3. Cloud 與資料層方向

- 目標平台為 Cloudflare；新 backend 不延續 GAS 作正式主後端。
- 正式資料與 API 必須有 server-side validation、permission boundary、schema/forward-migration source of truth 與 auditability；不得只依賴前端驗證。
- Production D1 以新 canonical model／Final Data Dictionary 建立乾淨初始資料庫；後續 schema 變更必須走可追蹤的 forward migrations，不得只在 Dashboard 手工修改後失去 source of truth。
- SMART ERP 與 CY Web 的資料權威邊界依已確認 Business Decisions 設計；未來 ERP 讀取／同步使用 adapter/service boundary，不把 ERP physical schema 耦合進各業務模組。
- 具體 frontend framework、database service 組合或其他 Cloudflare service 組合在使用者正式定案前屬工程規劃；可記錄於 README／TODO／設計文件，不得因技術推薦就默默升格為永久規則。

### 3.1 Public Source 與正式 Cloud Infrastructure 分離

- Public source 只保存可重用的 binding／service contract、template、placeholder、schema migration、deployment logic 與 API contract；志遠 production infrastructure metadata、正式資料與 credentials 不直接 commit 到 Public Git。
- 正式部署所需的 infrastructure metadata 與 deployment/runtime secrets 由核准的部署環境或平台 secret store 注入；程式只依賴抽象 binding／environment contract。
- 正式部署可在受控 runner/workspace 動態產生 deployment-only config，但不得把該 production-resolved config 回寫 Public repo。
- PR／一般 CI 不得取得 production deployment secrets，也不得部署 production；production deploy 只由核准 branch/environment 執行。
- 同一份 Public source 應可由其他 deployer 接到自己的 Cloudflare、D1、Identity、Storage、第三方 API 與 secret configuration，不預設共享志遠正式資源。
- 後續新增任何外部服務前，必須先設計 Public-safe binding 與部署注入邊界，不得先把 production identifier 寫進 Public source 再事後清除。
- 詳細實作參考 `docs/architecture/CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md`；若與本文件衝突，以本文件為準。

## 4. RWD + Adaptive UI

- 前端只維護單一網站、單一主要前端 codebase，不建立獨立 Desktop 與 Mobile 兩套長期 source。
- RWD 是共同 layout 基礎；Mobile 不得只把 Desktop 等比例縮小或單純換行，必須依使用情境做 Adaptive UI。
- 不同裝置可採不同 presentation，但資料語意、權限、validation、API contract 與操作結果必須一致。
- Desktop 以高資訊密度、快速查詢、多欄位同時可見與鍵盤效率為優先。
- Mobile 以查詢、確認、快速輸入、簡單修改與觸控操作為優先；可使用 Drawer、卡片、單欄表單、較大 touch target、Bottom Sheet／全螢幕流程等。
- Tablet 依實際畫面介於 Desktop 與 Mobile 間調整；Breakpoint 是實作工具而非固定產品規則。

## 5. Web Design System

- CY Web 不以 WinForms／Win32 外觀作 Web UI 標準，也不要求與 CY Desktop Visual Guide 視覺相同。
- 可建立適合企業 Web App 的獨立 Web Design System，包括 color tokens、spacing、typography、form、table/list、dialog/sheet、navigation、responsive pattern、interaction states 與 accessibility。
- Desktop 與 Mobile 應屬同一產品視覺語言；Mobile 專用元件變體與 layout 不視為第二套網站。
- AITeam `shared/cy-visual/` 是 family-wide visual canonical source；未來若建立正式 Web canonical package，本專案依治理鏈採用並保留必要 project-specific 例外。

## 6. 共用模板與一致性

- 重複性高的 Web 基礎能力優先抽成共用 component／template／service，例如 App Shell、navigation、auth client、permission guard、API client、error/loading state、form controls、table/list、search、dialog/sheet、audit UI、responsive patterns。
- Customer、Order、Item、Outsourcing、WorkLog 等模組優先延伸既有 shared component／service／schema，不建立功能等價但互不相容的第二套實作。
- 共用模板不得把單一模組特殊業務硬塞成全域規則；真正特殊需求維持最小 scope。

## 7. 帳號與 CYCloud Identity

- 現階段 CY Web 先重用 CYInvoice Cloud 既有帳號能力，包含相容的 Workspace／Employee／Credential／Session／OTP／Recovery contract。
- CY Web 必須透過清楚的 auth／identity adapter 或 service boundary 使用既有帳號能力，避免在 UI、domain model 或 business module 中擴大 CYInvoice-specific 耦合。
- 中期目標是把共用身分能力從 CYInvoice Cloud 抽離為 CYCloud Identity，供 CYInvoice、CY Web、CYAccounting Web 與未來 Cloud App 共用。
- App-specific permission 由各 App 定義；共用 Identity 不應把單一 App 的全部細部 permission 永久寫死成全域角色。

## 8. 上線與驗收

- CY Web 採新系統分階段驗證方式，不以目前 Legacy 測試資料的 migration 成功作為上線前提。
- 正式 production D1 使用乾淨 canonical schema；不得因方便而把未投入使用的 Legacy Sheet 測試資料搬入後視為正式基準。
- 各階段仍需驗證 Business Decisions、主要 CRUD、重要計算／狀態、權限、server validation、audit、Desktop／Tablet／Mobile 操作與必要 recovery 策略。
- 正式上線前至少完成 Identity/permission、高風險操作、主要業務 workflow、RWD/Adaptive UI 與 backup/restore 災難復原驗收。
- 使用者確認 CY Web 穩定後，才停止／刪除舊 GAS deployment 與 Sheet；在此前不得因 Public repo 新系統開發而擅自破壞舊測試／參考環境。
- 若未來另有真實 production 資料來源需要 import/sync，必須先明確定義資料權威、映射、核對與 rollback 策略；不得把已取消的 Legacy 測試資料 migration 假設自動復活。
