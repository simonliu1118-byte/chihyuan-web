# CY Web V0.11.3 ERP 未收款共用表格交接

- 日期：2026-11-05，GPT；基準 `main` @ `5782670bbcd841518f3415002d418f3ba4ac34e2`。
- 工作分支 `cyweb/erp-receivable-shared-table`，Claude 審查待填，尚未合併、部署。
- 使用者需求：未收款客戶清單及展開明細都用共用表格；客戶編號至少10碼、名稱至少10中文字、金額六位數不折行，展開沿用共用箭頭。

## 修改
- `ErpReceivableQuery.tsx`：群組改為共用 `cy-op-table`、`ExpandToggle`，展開列直接接續表身；每個結果獨立記憶展開狀態，單客戶預設展開。
- `ErpQueryRows.tsx`：新增可選 `tableMode="shared"`，保留原本自適應模式與25筆分頁、憑證點擊。
- `erp-item-query.css`：未收款 scoped 欄寬、金額不斷行，主表與明細在各自可水平捲動區域內呈現。
- `scripts/erp-receivable-layout.test.mjs`：表格、展開、欄寬及回歸結構測試。
- `VERSION`、`package.json`、`CHANGELOG.md`、`TODO.md`、架構契約及 handoff 入口：同步版本／待審狀態。

## 風險與驗證
- 未改 ERP Agent、Worker、API、DB、權限或真實客戶資料；Public source 不包含使用者截圖真實資訊。
- 客戶編號160px，客戶名稱在最小780px表格內約320px；小計160px。明細最小1350px，長憑證橫向捲動。
- 新工作結果不承接前次展開狀態；收合時明細會卸載，重新展開回到明細第一頁。
- 第一輪 CI：Governance、Worker Typecheck、Build、Source Contracts、部署契約檢查通過；Browser Typecheck 發現 `TS18047: expanded 可能為 null`（`ErpReceivableQuery.tsx:53`），修正為顯式判斷非 null，已加入同工作分支重新驗證。CI 新結果待核對。
- GitHub CI 結果待補；桌面／手機、10碼、10中文字、金額與展開憑證的實際目視驗收待補。Claude 結論不得由 GPT 代填。

## 2026-11-06 正式部署驗收

- 使用者明確要求部署 PR #435；該 PR 已合併，產品來源 main 為 `95bcbd895dd11f4c31111240f76bf325a3b91d38`，版本 V0.11.3。上文尚未合併、部署與 CI 待核對均為原交接當時狀態。
- 最終 PR head `b56ba04a099becd254fec1296c0162898d7a3c30` 的 [Runtime 42053275413](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42053275413)、[Governance 42053275260](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42053275260)、[部署契約 42053275324](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42053275324) 均成功；原 TypeScript null 檢查問題已修正並通過。
- 從 main dispatch [正式部署 42066049745](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42066049745)，validate-deployment-contract 與 deploy-development 皆 success；非本次執行的 audit jobs skipped。
- 獨立唯讀回讀正式 /api/health：ok=true、version=0.11.3、sourceCommit 與上述產品 SHA 相同、database=ok。既有部署內的雙入口版本、HTTPS／資產、排程及 Identity gates 亦通過。
- 本次只發布已合併的程式，沒有新增 migration、Worker、正式資料匯入、金鑰或 Release；未查閱 ERP 真實客戶明細。桌面／手機的實際目視驗收及 Claude 事後複審仍待，不由 CI 或 GPT 代填通過。
