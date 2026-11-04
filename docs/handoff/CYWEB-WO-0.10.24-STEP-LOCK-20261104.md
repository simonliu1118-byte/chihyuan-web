# WO-0.10.24 門市步驟鎖定與物流顯示交接

- 2026-11-04（台灣時間），GPT；分支 `cyweb/wo-0.10.24-step-lock`；V0.10.24 Build 0；PR [#426](https://github.com/simonliu1118-byte/chihyuan-web/pull/426)。
- 基準 main `3a662d7f`（V0.10.23），另承接工單分支 `d6e6b679` 的文件提交。工單當時尚未進 main，因此本 PR 包含工單原文。
- 需求唯一來源：[WO-0.10.24](../development/work-orders/WO-0.10.24.md)。狀態：實作完成，待 Claude 審查；未合併、未部署。

## 已完成行為

- 維修下一步登記後，前一步的日期與所有細節鎖定，包含以「無日期」登記的步驟；API 回 409「下一步已登記，不能修改」，不寫入資料／事件／稽核。
- 運用共用 `repairStepLocked` 同時判斷前端及後端；目前最後一步可更正，原有退回會清除當步資料並恢復前一步可改。無異常略過送廠／完修、取消後仍須通知歸還的規則不變。
- 送廠格與歸還格均帶出既有物流及寄送編號；可編輯時沿用 `StoreShippingFields`，已鎖定時欄位停用，只留「關閉」。五分鐘外的已歸還單仍可檢視物流，不能存檔。
- `PATCH /repairs/:id/date` 增加 SENT 的 `shipping`，以及 RETURNED 的 `returnMethod`／`shipping`；物流、編號、自送註記沿用既有驗證。改回自取時清空寄送資料；只更正日期的舊 payload 繼續可用。資料、事件與 Audit 使用既有版本 guard／requestKey／同一 batch。
- 訂購已通知後叫貨日期停用，API 同樣拒絕；目前通知仍可改，取貨後仍依原猶豫期只允許最後日期更正與退回。未接通不推進，因此仍可再次登記；缺貨／絕版停產／無法訂購的叫貨結果原本鎖定不變。
- 訂購退回既有規則會保留較後步驟日期作歷史，所以鎖定依有效狀態判斷，不把保留日期當成重新登記；沒有清除既有日期。維修退回本來就清除退回當步欄位。
- 本單不改任何取消、撤回取消、撤回結案或五分鐘計時規則。維修歸還日期／物流只在既有結案時間窗內可改，沒有延長時間；訂購改最後日期原有重算時間保留。

## 修改檔案

| 檔案 | 原因與影響 |
| --- | --- |
| shared/store-repairs.ts | 新增已完成後續步驟判斷，狀態涵蓋無日期登記；不改流程轉移。 |
| worker/http/store-repair-routes.ts | date endpoint 先檢查鎖定與適用步驟，增加物流更正，沿用驗證及原子提交；修改紀錄帶日期／檢測或物流的前後值。 |
| worker/http/store-routes.ts | 訂購 date endpoint 增加有效進度的先後鎖定，保留特殊及結案規則。 |
| src/runtime/modules/StoreRepairs.tsx | 已登記格仍可打開；最後一步可修改，較早步驟全停用且無儲存；送廠／歸還帶回物流；已結案沿用時間窗。 |
| src/runtime/modules/StoreCustomerOrders.tsx | 較早已登記日期停用但顯示日期；下一步與目前一步操作不變。 |
| src/runtime/modules/store.css | 手機展開流程格佔整欄，避免新增物流擠在半格；手機日期按鈕固定既有 36px 高，避免 height:100% 與相對定位視窗造成欄高循環撐大。桌面與其他清單樣式不變。 |
| scripts/store-repairs.test.mjs | 更新舊的任意更正先前日期期待；新增無日期鎖定、失敗零事件、物流驗證／更正／稽核、退回恢復、歸還時間窗與自取清空測試。 |
| scripts/store-route.test.mjs、scripts/store-page.test.mjs | 先前日期回 409、目前日期可更正、退回保留歷史且恢復修改；UI 日期仍可見、舊步驟停用。既有特殊流程測試保留。 |
| 架構文件、WO §8、TODO／CHANGELOG／handoff README、VERSION／package.json | 同步契約、驗證、版本及 Claude 待審入口；無 schema、依賴或部署設定變更。 |

## 驗證與限制

- `npx tsc --noEmit -p .`、`npm run typecheck`、`npm run build`、`npm run validate:source` 通過；來源驗證使用既有 portable Python 並設 PYTHONUTF8=1。建置只有既有 bundle 大小提醒。
- 相關三支測試：**79/79 通過**，涵蓋舊的未接通、缺價、取消、黑名單、結案猶豫等行為。
- 完整 Node 本機：622 項，611 通過、11 失敗。使用最新 main 原文建立隔離複本，重跑失敗所在四支：37 項中同樣 26 通過、11 失敗，確認非本單造成。既有 Windows 問題是：backup-rehearsal-http 6 項回 503、deployment-source 1 項以 LF 切 CRLF、secure-entry 1 支 /C:/ URL pathname、store-backup-upgrade 3 項 LF／CRLF migration 指紋。沒有修改這些測試或其產品流程來規避。
- `npm run validate:d1:local`：migrations（至 0050）、18 組 Worker＋D1 驗收、舊 Identity session 表移除全部 PASS；指令最後因 Windows Miniflare 的 metadata.sqlite 仍占用而在 TemporaryDirectory 清理回 WinError 32，故不把本機指令寫成 exit 0。完整命令與完整 Node suite 已由 PR Linux CI 通過（見下方）。
- 正式 API／ERP／Identity／D1 未操作。本機預覽使用實際 React 元件及被忽略的合成資料替身；畫面驗證帶回的物流值、唯讀控制項、唯一關閉按鈕、目前通知可改、舊叫貨停用，以及 390 寬版面。實際寫入語義由呼叫原 Worker handler 的記憶體資料庫測試驗證。
- 沒有新增資料表、migration、背景輪詢或額外 D1 讀取；鎖定只用現有單筆資料，既有版本及原子 guard 保留。
- `git diff --check` 通過；六張圖片已從 Git read-back，bytes／SHA-256 與交接一致。
- 產品提交 `606cfaee` 的 [Runtime Check #950](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41833994288) 全部成功：source-contracts、browser-typecheck、worker-typecheck、build；build 中 Local D1 runtime acceptance、Full Node test suite、Vite build 三個步驟均 success。
- [Governance #1077](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41833994437) 與 [部署契約檢查 #939](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41833994278) 成功，實際 deploy-development／audit-identity／audit-backup 均 skipped。最後一筆提交僅回填 PR／CI 文件，不改產品或版本。

## 合成畫面證據

| 狀態 | 圖片 | 尺寸 | SHA-256 |
| --- | --- | --- | --- |
| 送廠為最後一步，可改日期與物流 | [01-sent-editable.jpg](WO-0.10.24/01-sent-editable.jpg) | 1440×1000 | `5661e6cd22ec576811c5ae41f18690a048b9d0e0e7ec714174633e45d03ed9c2` |
| 完修後送廠欄唯讀，只留關閉 | [02-sent-locked.jpg](WO-0.10.24/02-sent-locked.jpg) | 1440×1000 | `172259dc7fb6cfb285081d66cd7b3382cf8089aa7fbb5ba81145401fbd547585` |
| 送廠後檢測日期／結果／補充說明鎖定 | [03-inspection-locked.jpg](WO-0.10.24/03-inspection-locked.jpg) | 1440×1000 | `d6b98fed0d4183714aa70a53e0a4463db12c37bfd9a0e917765004964708335c` |
| 訂購叫貨日期停用，通知日期仍可改 | [04-order-previous-locked.jpg](WO-0.10.24/04-order-previous-locked.jpg) | 1440×1000 | `aac844c388fae010542a97b5806f7744824a0ab18557950d0773b1b2a3a55e0e` |
| 結案歸還物流仍可檢視 | [05-return-shipping-locked.jpg](WO-0.10.24/05-return-shipping-locked.jpg) | 1440×1000 | `1ab6833593796b5b2f2fc57e7baf39961fbb82a4748113e153a67ba04d0a1a0f` |
| 手機鎖定物流，展開使用整欄 | [06-sent-locked-mobile.jpg](WO-0.10.24/06-sent-locked-mobile.jpg) | 375×812 | `ee167b9bfde6642ed4f7abacc1f9cc93360035792fda4d3075153489d93d11fb` |

## Claude 接續

對照工單、架構文件、PR 差異及 CI 審查；重點是無日期登記鎖定、退回保留日期與有效狀態、取消／結案時間窗、物流變更的事件與 Audit。工單 §9 與本檔最終審查由 Claude 填寫。依工單不自行合併或部署。

## Claude 最終審查

待 Claude 填寫；GPT 未代填通過。
