# CY Web Repository Policy

本文件只定義 `simonliu1118-byte/chihyuan-web` 的 repository-specific 規則。共通規則依根 `REPOSITORY_RULES.md`；產品永久規則依根 `PROJECT_RULES.md`。

## 1. Repository 身分

- 本 repository 為 **Public、source-visible proprietary**。
- 正式產品名稱：`Chihyuan Enterprise Management System`；內部簡稱：`CY Web`。
- Public visibility 不代表 open source；使用、修改、散布與商業權利依根 `LICENSE`。
- 志遠固定英文名稱使用 `Chihyuan`／`Chih-yuan`，縮寫固定為 `CY`；不得使用 `Zhiyuan`。
- 中文名稱需要轉寫羅馬拼音時依共通規則採 Wade–Giles（威妥瑪）。

## 2. Public 安全

- Git、Issue、PR、Actions log、Artifact metadata 與 Release note 均視為可能公開。
- Public repository 不得保存 production credentials、正式使用者／客戶／交易／帳務／員工敏感資料、正式資料庫 export、第三方 private data、正式執行環境設定或其他機密。
- `.clasp.json`、local-only settings、runtime secret files 與同類本機設定不得進入 Public source。
- 舊 Private Legacy repository 的可讀內容不代表可直接複製到本 Public repository；抽取前必須先做資料最小化與 Public-safe 檢查。

## 3. AITeam 共通規則同步

- AITeam `main` 是共通治理唯一 canonical source。
- 本 repo 的 `REPOSITORY_RULES.md`、`COMMON_RULES_VERSION`、`COMMON_RULES_CHANGELOG.md` 必須與 AITeam `main` 完全一致。
- AITeam 共通規則更新後，同一輪治理工作應直接以 Git／GitHub API／治理 PR 同步三個共通檔；本 repo 的 sync workflow 與 Governance Check 作第二道保險。
- 共通規則同步不得覆蓋本 repo 的 `REPO_POLICY.md` 或 `PROJECT_RULES.md`。

## 4. CY 共用視覺 canonical source

- AITeam `main:/shared/cy-visual/` 是 CY 家族共用視覺與 production design asset 的 canonical source。
- 現有 Windows desktop 視覺／icon 規則主要適用 CY Windows desktop apps；CY Web 不自動採用 Desktop Visual Guide 或 Windows icon-production 規則作 Web UI 規格。
- CY Web 維持必要的 CY 品牌、名稱與家族辨識一致性；Web layout、navigation、form、table、responsive pattern、touch interaction 與 adaptive presentation 依本專案 Web 規則設計。
- 若未來 AITeam 建立正式 Web canonical package，CY Web 應透過既有治理鏈宣告採用，不建立第四層規則檔。
- Family-wide 視覺標準需要變更時先回 AITeam canonical source；CY Web 專屬永久例外只寫入唯一 `PROJECT_RULES.md`。

## 5. Legacy 邊界

- 舊 GAS／Google Sheets prototype 的完整 source 與 Git 歷史保留於 Private `chihyuan-legacy-private`，不 mirror 進本 Public repo。
- 該 prototype 尚未正式投入使用；現有測試／開發資料不是 Public repo 的 production migration source。
- 本 repo 只保存經確認可公開的 Legacy 資料模型、流程、ID／狀態／驗證語意與行為參考，以及新 CY Web 的 Business Decisions／canonical design；不得為方便搬入私密識別資訊、本機設定、舊登入 bootstrap 或真實測試資料。
- Pre-consolidation audit/draft 可存放於 architecture archive 作追溯；current architecture index 與較新的 Business Decisions 才是日常實作應優先閱讀的文件。

## 6. Web 部署與 Release

- Web deploy 與 GitHub Release 是不同流程。
- 正式部署必須可由 repository source、forward schema migrations 與受控環境設定重建並留下可追蹤紀錄。
- 正式資料庫 schema 變更必須回寫 migration/source of truth，不得只在 Cloudflare Dashboard 手工修改。
- 未經使用者明確要求，不因一般 branch push 建立 GitHub Release。
- 部署識別碼（Worker／D1／R2／Service 名稱與 ID、Application／Workspace ID 等）不得經由 GitHub variables 傳入部署流程：Actions log 會在任何 `::add-mask::` 之前明文印出 env。部署時由正式網域向 Cloudflare 查詢現行綁定、先遮蔽再使用（`scripts/resolve-deploy-runtime.mjs`），無法查詢的值改用 secrets；開關類字串不在此限（2026-11-17）。
- 部署流程不得以命名慣例推導另一個資源（例如由 `-dev` 推出 `-prod`），一律用實際名稱或查得的現行綁定（2026-11-18）。
- 刪除 Cloudflare 資源或環境時，同一輪必須移除或改寫所有引用它的 workflow、secret／variable、測試與文件，不得留下只會失敗、平常又不執行的流程。
- 本 repo 部署時引用 CYapps `main` 的 CYID 正式核對程式；該程式在 CYapps 變更時，由 CYapps `cyweb-consumer-check.yml` 以 PR 版本執行本 repo 的 `audit-account-portal`／`resolve-deploy-runtime` 測試。本 repo 若改動這兩個測試所依賴的介面，須同步確認 CYapps 端檢查仍通過。
- 部署流程或部署識別值處理方式變更後，必須實際部署一次並下載完整 log 以實際值比對，確認未外洩才算完成。

## 7. Copyright

- 正式 copyright notice 使用：`Copyright © <YEAR> C.C. Liu, Chihyuan Co. All Rights Reserved.`
- `<YEAR>` 依實際發布年份處理。
