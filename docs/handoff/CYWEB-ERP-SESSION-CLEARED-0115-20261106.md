# CY Web V0.11.5：ERP 完成結果無 Session 時隱藏空白卡

- 日期：2026-11-06；執行：GPT。原始基準 main `dc47572026749f4dd4d942064d44598e64aa6c94`（V0.11.3），整合於 #437 合併後的 `main@1e6b1436d3cb32d5c2df67c78d2bf3756f3a4795`（V0.11.4）。
- 工作分支：`cyweb/erp-hide-missing-session-result-0115`。
- 發版順序：V0.11.4 PR #437 已合併；PR #439 重新以合併後 main 為基準，完成 V0.11.5 的 VERSION、TODO、CHANGELOG 及 handoff 整合。PR #438 不包含在發布範圍，且需另處理 0053 migration 碰撞。
- Claude 最終審查：**待審查**；不由執行者代填結論。

## 使用者意見與原因

使用者確認剛剛確實登出；登出會清空目前分頁 ERP 結果 Session，符合原規則。但重新登入後，ERP 後端只留下最近查詢 metadata、且 resultCleared=true 的舊紀錄仍被用作空白查詢結果卡，顯示「查詢完成／結果已清除，請重新查詢」，對使用者沒有幫助。

## 修改範圍

- `src/runtime/modules/erp-result-cache.ts`：以現有 keep／restore 行為整理為 `erpResultForDisplay`：只有 DONE 且已在伺服器清除結果時才查同 ID 本機 Session；找不到回傳 null，不建立替代結果。
- `src/runtime/modules/useErpJob.ts`：查詢 API 回應進入結果 UI 前套用此判定；空資料時直接 setResult(null) 並停止該筆輪詢，保留其他狀態（QUEUED、RUNNING、FAILED、NOT_FOUND 等）。
- `scripts/erp-result-session.test.mjs`：同 ID Session 仍顯示、不同 ID 不借用、登出清除後不顯示、執行中與失敗仍呈現。
- `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、ERP 契約及本 handoff：記錄 V0.11.5 行為及待完成項。

## 影響、風險與驗證

- 前端 UI-only；不改 Worker／Agent／D1、資料保留期限及存取權限，也不需 migration。
- Session 保存成功時仍可在伺服器清掉資料後恢復；關閉分頁、登出或瀏覽器無法儲存時，舊空白卡不顯示。
- 影響所有共用 `useErpJob` 的 ERP 類別，非僅品名查詢；仍保留其他結果狀態。
- PR #439 第一輪（head `5e5c36a77d4923414389583908f97556b368ed94`）：[Runtime Check #42172787370](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42172787370) **success**（browser-typecheck、worker-typecheck、source-contracts、Local D1 runtime acceptance、654/654 Node 測試、Vite build 均成功）；[Governance #42172787322](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42172787322) **success**；[部署契約 #42172787293](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42172787293) **success**。
- PR 內 deploy-development 與正式 audit jobs skipped，**沒有部署正式站**。待 Claude 對照 PR、測試結果及相鄰 V0.11.4／V0.12.0 版本整合檢查；待使用者實機確認「登出→重新登入→無結果卡」。
- 使用者於 2026-11-06 明確要求合併部署 #437 及 #439；Claude 最終審查紀錄仍不存在，依當次指示先合併，保留事後複審待辦，**不宣稱 Claude 已通過**。正式站尚未部署，最新已確認版本仍為 V0.11.3。
