# CYWEB Governance 1.1.24 — GPT → Claude handoff

- **狀態：待 Claude 審查；不合併、不部署。**
- 日期：2026-10-28；分支：`governance/cyweb-handoff-claude-20261028`
- 此為使用者指定的 CYWEB 交接／審查工作程序治理 PR，與應用修正 [PR #300](https://github.com/simonliu1118-byte/chihyuan-web/pull/300) 分開。
- 規則來源仍是 `PROJECT_RULES.md`、`REPO_POLICY.md`、`REPOSITORY_RULES.md`，本 handoff 只是交接、驗證及審查紀錄。

## 1. 使用者指示與目的

使用者明確指示：「所有你對CYWEB修正的事項，都要寫在handoff，最終交由claude審查。」從本版起，對由 GPT／ChatGPT 執行的每一項 CYWEB 修正（程式、測試、文件、版本及部署流程）要求同分支的 `docs/handoff/` 完成報告，交 Claude 親自審查；尚未審查通過前不合併。Claude 通過不等於正式部署授權。

## 2. 逐檔變更與原因

- `PROJECT_RULES.md`：在既有 §9 追加 §9.1，規定 handoff、逐項變更、驗證證據及 Claude 最終審查；特別說明此為「GPT 直接承接 CYWEB 修正」的專案專屬要求，**不改 AITeam 共通規則 §11.4 的 Claude-first 工作單適用條件**。
- `GOVERNANCE_VERSION`：1.1.23 → 1.1.24。
- `GOVERNANCE_CHANGELOG.md`：新增 1.1.24 的治理變更與不變更範圍。
- `.github/workflows/development-deploy.yml`：在 `main` 的受控 `workflow_dispatch` 新增 `rotate-recovery`；要求 generation、明確確認語、主分支及已完成的新版 provision 原始碼檢查，輪替與正常部署共用不取消的 `cyweb-production` 鎖。此入口只在使用者未來另行核准後才會被手動觸發，PR/push 不得輪替。
- `scripts/deployment-source.test.mjs`：新增受控輪替 dispatch、原始碼 guard 及既有來源驗證順序的回歸測試。
- `scripts/erp-business-query.test.mjs`：Runtime Check 曾兩次遇到未改動的 ERP 佇列 synthetic 測試因同毫秒 `created_at`／隨機 UUID 排序導致失敗；僅將三筆測試資料的 created_at 明確相隔 1 秒，修正測試非決定性，不變更實際 ERP 生產行為。功能 PR #300 同步該測試修正，避免其中一支 CI 偶發失敗。
- `docs/handoff/CYWEB-GOV-1.1.24-CLAUDE-REVIEW.md`：本份執行、驗收及 Claude 審查紀錄。
- 本治理 PR 沒有動 `VERSION`、`BUILD`、產品程式、D1 migration、Cloudflare、R2/GCS 或正式資料。Workflow 是新增受控**未執行**的正式輪替入口，實際建立、套 migration 和新目標驗證引擎由功能 PR #300 提供。兩份 PR 必須由 Claude **一起審查**，並建議 **先合併 #300，再合併 #301**，避免入口存在而引擎尚未就緒；即使順序顛倒，新增來源 guard 也須先拒絕操作。

## 3. 治理驗收與風險

- [x] **治理分支最新程式提交**（更新 handoff 前 HEAD `38a32799aefb514127f4e3b977f6e1be5db70e68`）：[Governance Check #40662751520](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662751520)、[Runtime Check #40662751519](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662751519)、[Deploy PR contract #40662751588](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662751588) **均 success**，實際 deploy-development skipped。原則：`governance/*`、`GOVERNANCE_VERSION`／`GOVERNANCE_CHANGELOG.md` 同步。
- [x] 功能 PR #300 對應程式測試檢查通過：[Governance #40662905471](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662905471)、[Runtime #40662905472](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662905472)、[Deploy PR contract #40662905385](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662905385)。
- [ ] Claude 核對 §9.1 是否與 `REPOSITORY_RULES.md` §11.4、`docs/development/work-orders/README.md` 現行規範相容。
- [ ] 核對 Workflow 僅 main 手動 `rotate-recovery` 可建立新 D1 並改綁，必須保留正常 deploy/push 行為；確認來源 guard 先於任何遠端更動，權限及 `cyweb-production` 鎖不降級。
- [ ] 核對 `scripts/deployment-source.test.mjs` 及 `scripts/validate-deploy-config.mjs` 在 Governance/Runtime/Deploy PR CI 可通過，並完整比對功能 PR #300 的 generation 與確認參數一致。
- [ ] 確認 handoff 是非規則的執行交接紀錄，沒有建立新的第四層永久契約。
- [ ] 確認不含任何正式資源識別、Secret、個資或實際業務資料。
- [ ] Claude 將審查結果回寫本文件；需修正則依審查意見修改後再複審。
- [ ] 審查通過後仍需使用者對合併／正式部署作另外授權。

## 4. GPT 完成報告

正式機制本應從治理分支建立，因此本次將先前在 V0.9.48 一般功能 PR 的 `PROJECT_RULES.md` 修改分離至本治理 PR，避免繞過 Governance Check。此處修改 Public Git 治理檔案、受控 Workflow 及來源防護測試，沒有 Cloudflare API 操作；Cloudflare 讀 0、寫 0、資源異動 0。明確警告：PR #301 不提供自行部署或輪替的授權；此輪唯一完成的是受控入口的程式碼。

## 5. Claude 審查紀錄（僅 Claude 填寫）

- 審查日期：
- 審查者：Claude
- 審查的 PR head SHA：
- 結論：**待審查**（通過／需修正／阻擋合併）
- 驗證與意見：
- Claude 直接修正與 GPT 返修紀錄：
- 是否可交使用者核准合併：
