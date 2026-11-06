# CY Web V0.12.1 盤點紀錄與 ERP 清除同步歸檔交接

- 日期：2026-11-07（Asia/Taipei）；執行：GPT；分支 `cyweb/stocktake-records-0121`，基準 main `9363e05f138b57e2064f4af108b98f793b3d1b51`。VERSION=0.12.1、BUILD=0。
- 使用者授權實作：ERP 已不存在的盤點單移出左側清單，轉入「盤點紀錄」視窗；保留先前定案的人員／確認／差異，主列 70% 顯示品號品名並折行。
- 這次涉及 schema 及歷史清除，**未合併、未部署、不執行正式 migration／資料清除**；依既有複雜變更流程先交 Claude 審查，另待使用者發布授權。正式站仍為 V0.12.0 Build 1。

## 核心實作與原因

1. `stocktakeArchiveStatements` 在 ERP full sync complete 的同一批次保存紀錄及清除來源，固定六個 bulk SQL statements，不逐列發 D1 query。僅接受明確 `listComplete:true`，FAILED、單張 refresh 與舊 Agent 不歸檔；沒有新明細但完整清單全 skip、或完整 0/0 空清單，都可比對消失底稿。
2. `/sync` 的 server-only `knownSheets` 保存請求時底稿編號＋created_at，沒有加入 Agent claim；避免舊同步歸檔之後新建的單。尚有排隊／執行中的 STOCKTAKE_WRITE 留待下一次同步，不讓正在寫回的單失去來源。此保護以既有 queue 狀態判斷，不新增第二套工作權威。
3. 先新增 records、去重品號品名、參與者／初盤複盤、確認人與時間、ERP 完成時間、差異／未完成列，再刪除作業單。FK cascade 移除 lines／location_counts／line_history／participants；原共用 Audit 不刪。最後一筆歸檔 Audit 用 `changes()>0`，緊接刪除，只在實際歸檔時留下群組事件，無逐列數量複製進共用 Audit。
4. 每 ERP seq 的帳面只計一次；多儲位完整合計初盤／複盤。須複盤但未填齊時 actual／difference 保留 null，不以初盤或零冒充。SQLite 用整數萬分位運算，持久化合計為 TEXT，避免 JSON 大整數精度損失。只有差異／未完成列保留數量，所有品號名稱獨立去重保留。
5. 四張 `stocktake_record_*` 表納入 portable backup，正式來源代次 unique；歸檔後 ERP 重用單號可匯入成新作業單，同號多代紀錄不互相覆蓋。沒有從 ERP 寫回或清除 ERP 的新操作。

## UI 與讀取成本

- 「同步ERP盤點單」「設定忽略底稿」旁加入「盤點紀錄」；具有 STOCKTAKE 模組使用權者可看，不另設權限。自動歸檔後，當前選擇及相關表單清空，不繼續顯示已消失的作業明細。
- 沿用共用 Dialog、cy-op-table、ExpandToggle。主表日期 8%、單號 7%、初盤 7.5%、複盤 7.5%、盤點內容 70%；品號＋品名以「、」串接折行。確認資訊與差異放在同表展開列，避免左邊 30% 被多組時間撐高。
- 紀錄依盤點日期／ID DESC 每頁 10 張，差異展開才讀、每頁 100 列；只有使用者開啟視窗／載入更多才讀歷史，不加背景輪詢、不把歷史塞進原 10／30 秒刷新，也不為總頁數 COUNT 全部歷史。
- 點背景不關閉，右上沒有 X，僅明確「關閉」。本機用真實元件及合成 API 預覽確認長內容折行、差異展開、確認資訊及關閉；沒有登入或操作正式站。

## 檔案與契約

- `migrations/0055_stocktake_records.sql`；`shared/stocktake.ts`；`worker/http/stocktake-records.ts`、`store-stocktake-routes.ts`、`stocktake-erp.ts`、`erp-item-query-routes.ts`。
- `worker/backup/portable-backup.ts`／`schema-columns.ts`、`scripts/validate_schema.py`、`scripts/store-equipment.test.mjs` 同步新 migration／備份契約；未改舊 migration。
- `StocktakeRecordsDialog.tsx`、`StoreStocktake.tsx`、`store.css`、`change-log-labels.ts`；`scripts/store-stocktake.test.mjs` 增加歸檔真 Worker＋SQLite 交易／權限／分頁／備份測試。
- 盤點與 ERP bridge 架構、資料字典、共用元件目錄、VERSION／BUILD／package.json、CHANGELOG／TODO／handoff 索引同步。

## 跨 Repo 依賴與 rollout

- 配套 CYapps `apps/CYERPAutoQuery` V1.3.1：舊 Win32 流程在 footer 總數未知時可能接受第一頁，零張又一律失敗，不能直接用舊結果判斷 ERP 清除。新 Agent 有上限重讀，總數與實讀一致才回 `listComplete:true`，支援明確 0/0；讀不全／總數變動／超限停止。
- 舊 Agent＋新 WEB 仍同步但不歸檔；新 Agent＋舊 WEB 忽略新增旗標。兩端都更新後才啟用完整歸檔；這是 protocol rollout 的最小相容窗口，正式最低支援 Agent 升級、舊 Agent 停用後可移除接受缺旗標的路徑，不另立平行同步邏輯。
- Agent 分支 `cyerp/stocktake-complete-list-131`；配套 [CYapps PR #604](https://github.com/simonliu1118-byte/CYapps/pull/604)，handoff：`apps/CYERPAutoQuery/docs/handoff/CYERPAutoQuery-STOCKTAKE-INVENTORY-131-20261107.md`。兩邊都待 Claude 審查；Agent 正式 Release／WEB 部署均須後續授權。

## 驗證、風險及 Claude 接續

- 本機 TypeScript／`npm run build` 成功；初輪盤點／出機／備份三支相關測試 **61/61 通過**，追加超過 2^53 精確合計及差異分頁驗證後盤點為 34 項；最後盤點、UI、Audit 標籤、表單欄位及鍵盤相關合計 **51/51 通過**。涵蓋歸檔、回滾、舊旗標、全 skip、空清單、請求代次、單號重用、寫回中保護、分頁、多人多儲位小數及備份往返。
- 新元件使用共用表格樣式；合成畫面預覽不是正式資料驗收。尚待登入後桌機／手機與 ERP 真正空清單／翻頁驗收，不能用合成結果代稱正式驗證。
- 大量 200 張 × 3000 行的歸檔仍需受控壓測。固定 SQL 次數不等於 D1 不讀資料；必要的摘要／差異掃描與寫入仍有成本，不宣稱免費或無限負載。
- 本機 Agent `dotnet test` 因沒有 .NET SDK 無法執行；配套 PR #604 的 Windows CI 已通過（含 Unit tests、Build、Publish；run `42263544302`），governance 亦通過。WEB 完整 CI 於開 PR 後執行。
- 沒有正式資料、ERP 匯出、憑證或 infrastructure ID 進 Git。Claude 最終審查待填，執行者不代填通過。重點請核對完整旗標、knownSheets 代次、原子保存後清除、精確量與備份、資料量、兩端相容以及待發布狀態。
