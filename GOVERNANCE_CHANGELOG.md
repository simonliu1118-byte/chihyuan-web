# CY Web Governance Changelog

## 1.1.0 — 2026/09/26

- 依使用者最新確認，修正永久 Legacy 邊界：舊 GAS／Google Sheets 尚未投入正式使用，現有測試／開發資料不作 production D1 migration source。
- `PROJECT_RULES.md` 改為 fresh-start production D1；保留 forward schema migration、server validation、audit、backup/recovery 與未來 ERP integration 要求。
- `REPO_POLICY.md` 明確把 Legacy 定位為 Private behavior/reference source，Public repo 不建立未使用測試資料的 migration compatibility layer。
- 新增 architecture document map、Business Decision index 與 archive 邊界，避免舊 draft／audit 的 `OPEN`／migration 假設凌駕後續已確認決策。
- 新增 BD-047（Legacy test data 不搬入 production）與 BD-048（SMART ERP 客戶編號可受控更正／變更，Customer internal ID 不變）。

## 1.0.0 — 2026/09/24

- 建立新的 Public `simonliu1118-byte/chihyuan-web`，正式產品名稱為 Chihyuan Enterprise Management System，簡稱 CY Web。
- 採用 AITeam Governance 2.0 三層規則架構與 Common Rules 2.6.0；正式基準 branch 直接使用 `main`。
- 建立 AITeam 共通規則直接同步、下游 sync workflow 與 Governance Check。
- 明確定義 Public-safe 邊界；舊完整 GAS prototype／Git 歷史保留在 Private `chihyuan-legacy-private`，不 mirror 進 Public repo。
- 宣告 AITeam `shared/cy-visual/` 為 CY family visual canonical source；CY Web 不自動套用 Windows Desktop Visual Guide／Windows icon-production 規則，維持獨立 Web Design System。
- 現階段帳號先重用 CYInvoice Cloud 既有相容能力，中期抽離為 CYCloud Identity。
