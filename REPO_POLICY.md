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
- 不得提交正式 API key、OAuth secret、access/refresh token、private key、session secret、OTP secret、Email provider key、固定正式密碼／雜湊、真實客戶／交易／帳務／員工敏感資料、正式資料庫 export、Google Sheet／GAS 正式識別資訊或本機私密設定。
- `.clasp.json`、`.claude/settings.local.json`、`.env`、正式 Cloudflare runtime secrets 與其他 local-only 設定不得進入 Public source。
- 舊 Private Legacy repository 的可讀內容不代表可直接複製到本 Public repository；遷移前必須先做資料最小化與 Public-safe 檢查。

## 3. AITeam 共通規則同步

- AITeam `main` 是共通治理唯一 canonical source。
- 本 repo 的 `REPOSITORY_RULES.md`、`COMMON_RULES_VERSION`、`COMMON_RULES_CHANGELOG.md` 必須與 AITeam `main` 完全一致。
- AITeam 共通規則更新後，同一輪治理工作應直接以 Git／GitHub API／治理 PR 同步三個共通檔；本 repo 的 sync workflow 與 Governance Check 作第二道保險。
- 共通規則同步不得覆蓋本 repo 的 `REPO_POLICY.md` 或 `PROJECT_RULES.md`。

## 4. CY 共用視覺 canonical source

- AITeam `main:/shared/cy-visual/` 是 CY 家族共用視覺與 production design asset 的 canonical source。
- 現有 `shared/cy-visual/desktop/CY_DESKTOP_VISUAL_GUIDE.md` 與 Windows icon-family 規則主要適用 CY Windows desktop apps；**CY Web 不自動採用 Desktop Visual Guide 或 Windows icon-production 規則作 Web UI 規格**。
- CY Web 仍維持必要的 CY 品牌、名稱與家族辨識一致性；Web layout、navigation、form、table、responsive pattern、touch interaction 與 adaptive presentation 依本專案 Web 規則設計。
- 若未來 AITeam 建立正式 `shared/cy-visual/web/` 或等價 Web canonical package，CY Web 應透過既有 `REPO_POLICY.md`／`PROJECT_RULES.md` 治理鏈宣告採用，不建立第四層規則檔。
- Family-wide 視覺標準需要變更時先回 AITeam canonical source；CY Web 專屬永久例外只寫入唯一 `PROJECT_RULES.md`。

## 5. Legacy 邊界

- 舊 GAS／Google Sheets prototype 的完整 source 與 Git 歷史保留於 Private `chihyuan-legacy-private`，不 mirror 進本 Public repo。
- 本 repo 只保存經確認可公開的 Legacy 資料模型、流程、ID、行為與遷移規格；不得為方便而搬入 Script ID、本機設定、舊登入 bootstrap 或真實測試資料。

## 6. Web 部署與 Release

- Web deploy 與 GitHub Release 是不同流程。
- 正式部署必須可由 repository source、migration 與受控環境設定重建並留下可追蹤紀錄。
- 正式資料庫 schema 變更必須回寫 migration/source of truth，不得只在 Cloudflare Dashboard 手工修改。
- 未經使用者明確要求，不因一般 branch push 建立 GitHub Release。

## 7. Copyright

- 正式 copyright notice 使用：`Copyright © <YEAR> C.C. Liu, Chihyuan Co. All Rights Reserved.`
- `<YEAR>` 依實際發布年份處理。
