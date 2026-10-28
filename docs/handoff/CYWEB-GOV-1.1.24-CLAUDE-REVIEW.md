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
- `docs/handoff/CYWEB-GOV-1.1.24-CLAUDE-REVIEW.md`：本份執行、驗收及 Claude 審查紀錄。
- 本治理 PR 沒有動 `VERSION`、`BUILD`、產品程式、D1 migration、Worker、Cloudflare、R2/GCS 或正式資料。

## 3. 治理驗收與風險

- [ ] Governance Check：必須是 `governance/*` 分支且同時變更 `GOVERNANCE_VERSION`、`GOVERNANCE_CHANGELOG.md`。
- [ ] Claude 核對 §9.1 是否與 `REPOSITORY_RULES.md` §11.4、`docs/development/work-orders/README.md` 現行規範相容。
- [ ] 確認 handoff 是非規則的執行交接紀錄，沒有建立新的第四層永久契約。
- [ ] 確認不含任何正式資源識別、Secret、個資或實際業務資料。
- [ ] Claude 將審查結果回寫本文件；需修正則依審查意見修改後再複審。
- [ ] 審查通過後仍需使用者對合併／正式部署作另外授權。

## 4. GPT 完成報告

正式機制本應從治理分支建立，因此本次將先前在 V0.9.48 一般功能 PR 的 `PROJECT_RULES.md` 修改分離至本治理 PR，避免繞過 Governance Check。此處只修改 Public Git 文字與治理版本，沒有 Cloudflare API 操作；Cloudflare 讀 0、寫 0、資源異動 0。

## 5. Claude 審查紀錄（僅 Claude 填寫）

- 審查日期：
- 審查者：Claude
- 審查的 PR head SHA：
- 結論：**待審查**（通過／需修正／阻擋合併）
- 驗證與意見：
- Claude 直接修正與 GPT 返修紀錄：
- 是否可交使用者核准合併：
