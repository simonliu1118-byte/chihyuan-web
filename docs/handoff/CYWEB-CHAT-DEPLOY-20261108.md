# CYWEB Chat 正式部署入口恢復交接（2026-11-08）

## 目的與使用者授權
- 使用者要求 ChatGPT／Claude 在明確獲得部署授權後，能直接用已連接的 GitHub Connector 發布 CYWEB；選擇恢復精簡、安全的 `deploy/cyweb-development` 發布分支。2026-11-08 使用者指示「開始做」。
- 既有 `main` 手動 `workflow_dispatch(operation=deploy-development)` 保持不變。一般 PR 合併與 main push 不自動部署。此 handoff 不代表自動部署成功。

## 本次修改
1. `.github/workflows/development-deploy.yml`：只增加特定發布分支的 push 觸發與 deploy-development 的分支條件；保留 main 手動 dispatch 和既有 validate、Environment、正式鎖、D1/Identity/Worker/health jobs。
2. `scripts/verify-deployment-source.mjs`：允許 main dispatch 或指定發布分支 push；兩者都須事件 SHA = checkout SHA = 最新遠端 main SHA、tree 一致且 main 可追溯。遠端 migration 前失敗即停止。
3. `scripts/deployment-source.test.mjs`：新增允許及拒絕事件、錯誤／舊 SHA 與部署工作契約測試。禁止 main push、其他分支 push、PR 及 release branch dispatch 直接部署。
4. `PROJECT_RULES.md`、`GOVERNANCE_VERSION`、`GOVERNANCE_CHANGELOG.md`：新增正式部署入口的專案特例，治理版本 1.1.29。
5. `docs/development/IDENTITY_DEPLOYMENT.md`、`TODO.md`、`docs/handoff/README.md`：更新 Chat 部署、同 SHA 重試與程式碼退版流程，保留 D1 正向遷移注意事項。

## 發布與退版操作
- 僅在 PR 必要 CI 成功、合併 main 且使用者允許部署時，取得 main **完整** SHA，透過 `mcp__GitHub__update_ref` 更新 `deploy/cyweb-development` 為該 SHA，使用 `force=false`。
- 發布分支只作為指向 main commit 的長期指標，不直接在其上提交功能、不得強制退回舊 SHA。
- 查新 `push` Run ID 與 `head_sha`，核對 `validate-deployment-contract`、`deploy-development` 成功，正式 canonical／workers.dev `/api/health` 要回報正確版本、`sourceCommit` 和 `database=ok`。沒有新 run 或驗證失敗時不可宣稱部署完成。
- 同一 SHA `update_ref` 不會產生新 push；須從 main 手動 dispatch 才能原樣重部署。
- 若需退版，在 main 用正常 PR 合併反轉變更的新 commit，再快轉發布分支；Worker/frontend 回復不代表正式 D1 schema 自動回復，必須另核對相容性。

## 風險／邊界／驗證
- 發布分支建立時先指向尚無 push deploy 觸發的舊 main。治理 PR 合併後才允許 `update_ref(force=false)` 推進至受審核最新 main，避免提前部署舊版本。
- 即使 PR 驗證成功，還須實際觸發及檢視正式 Action Run／兩端健康，不能以合併 PR 代替部署。
- 本次沒有新增 Worker、D1、Migration、正式 Secret、Grok webhook 或 BOT 憑證；`VERSION=0.12.5`、`BUILD=0` 不變。
- **CI 與正式部署證據待寫入**：此文件於治理 PR 準備時先記錄變更；以後續 GitHub Run 與正式健康結果為準，Claude 事後審查待辦。
