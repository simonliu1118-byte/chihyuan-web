# CYWEB WO-0.18.0 — 委外／代工分批流程、廠商庫存與對帳付款

日期：2026-11-10。工作分支：`cyweb/wo-0.18.0-outsourcing`。基準 main `7527b8898aefce3673cb80de67b07224e6d1b8e6`，V0.17.3；開發版本 V0.18.0。

## 開發紀錄（尚未完成）

- D1 migration `0062_outsourcing_flow.sql`：保留既有廠商、聯絡人、單價、BOM 主檔，重新建立目前空白的代工單資料模型與庫存 ledger，增加多批發料、交貨、退料／盤點、對帳單／付款資料表。
- `shared/outsourcing-flow.ts`：單一代工狀態 owner、ledger 電池條基準／百分比、產能、進度及對帳金額函式。
- `worker/outsourcing/flow-service.ts`、`worker/http/business-api-phase2-routes.ts`：新流程的受保護 API；仍使用 `OUTSOURCING` module gate。
- `src/runtime/api/outsourcing-flow-client.ts`、`OutsourcingOperationalPage.tsx`、`StockGauge.tsx`：五頁籤及共用元件初版；既有協力廠商與 BOM workspace 保留。
- `worker/backup/schema-columns.ts`：可攜備份新增資料表，移除舊代工單表。
- `worker/contractor/*`、`shared/contractor-outsourcing.ts`：廠商結帳方式單次／月結資料契約。
- `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、工單：開發中版本與 ERP 連動另案待辦。

## 目前缺口與驗證

- 尚須補齊工單各項操作與 UI（發料建議量、交貨扣料預告、成品分組與可做數量、表格式廠商主檔及實際畫面）。
- 尚未進行 GitHub CI 全數檢查、正式 D1／瀏覽器驗證，亦未取得桌機與手機截圖。
- 此文件為進行中交接，**不可視為完成報告或 Claude 審查通過**；Claude 審查欄位應待實作及驗證完成後填寫。
- **不可合併、不可部署、不可對正式 D1 執行 migration**。
