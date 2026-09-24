# CY Web Governance Changelog

## 1.0.0 — 2026/09/24

- 建立新的 Public `simonliu1118-byte/chihyuan-web`，正式產品名稱為 Chihyuan Enterprise Management System，簡稱 CY Web。
- 採用 AITeam Governance 2.0 三層規則架構與 Common Rules 2.6.0；正式基準 branch 直接使用 `main`。
- 建立 AITeam 共通規則直接同步、下游 sync workflow 與 Governance Check。
- 明確定義 Public-safe 邊界；舊完整 GAS prototype／Git 歷史保留在 Private `chihyuan-legacy-private`，不 mirror 進 Public repo。
- 宣告 AITeam `shared/cy-visual/` 為 CY family visual canonical source；CY Web 不自動套用 Windows Desktop Visual Guide／Windows icon-production 規則，維持獨立 Web Design System。
- 現階段帳號先重用 CYInvoice Cloud 既有相容能力，中期抽離為 CYCloud Identity。
