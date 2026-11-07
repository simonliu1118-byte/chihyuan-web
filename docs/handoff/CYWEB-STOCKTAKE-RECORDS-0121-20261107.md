# CY Web V0.12.1 盤點紀錄與 ERP 清除同步歸檔交接

- 日期：2026-11-07（Asia/Taipei）；執行：GPT；分支 `cyweb/stocktake-records-0121`，基準 main `9363e05f138b57e2064f4af108b98f793b3d1b51`。VERSION=0.12.1、BUILD=0。
- 使用者授權實作：ERP 已不存在的盤點單移出左側清單，轉入「盤點紀錄」視窗；保留先前定案的人員／確認／差異，主列 70% 顯示品號品名並折行。
- 使用者最新授權（2026-11-07）：**只合併部署 WEB**；CYERPAutoQuery 僅寫專案內 handoff，交 Claude 實作，不合併或發行 Agent。WEB 本輪先依明確授權發布，Claude 事後複審仍待辦，不代填審查通過；發布證據於完成後補記。

## 核心實作與原因

1. `stocktakeArchiveStatements` 在 ERP full sync complete 的同一批次保存紀錄及清除來源，固定六個 bulk SQL statements，不逐列發 D1 query。僅接受明確 `listComplete:true`，FAILED、單張 refresh 與舊 Agent 不歸檔；沒有新明細但完整清單全 skip、或完整 0/0 空清單，都可比對消失底稿。
2. `/sync` 的 server-only `knownSheets` 保存請求時底稿編號＋created_at，沒有加入 Agent claim；避免舊同步歸檔之後新建的單。尚有排隊／執行中的 STOCKTAKE_WRITE 留待下一次同步，不讓正在寫回的單失去來源。此保護以既有 queue 狀態判斷，不新增第二套工作權威。
3. 先新增 records、去重品號品名、參與者／初盤複盤、確認人與時間、ERP 完成時間、差異／未完成列，再刪除作業單。FK cascade 移除 lines／location_counts／line_history／participants；原共用 Audit 不刪。最後一筆歸檔 Audit 用 `changes()>0`，緊接刪除，只在實際歸檔時留下群組事件，無逐列數量複製進共用 Audit。
4. 每 ERP seq 的帳面只計一次；多儲位完整合計初盤／複盤。須複盤但未填齊時 actual／difference 保留 null，不以初盤或零冒充。SQLite 用整數萬分位運算，持久化合計為 TEXT，避免 JSON 大整數精度損失。只有差異／未完成列保留數量，所有品號名稱獨立去重保留。
5. 四張 `stocktake_record_*` 表納入 portable backup，正式來源代次 unique；歸檔後 ERP 重用單號可匯入成新作業單，同號多代紀錄不互相覆蓋。沒有從 ERP 寫回或清除 ERP 的新操作。

## UI 與讀取成本

- 「同步ERP盤點單」「設定忽略底稿」旁加入「盤點紀錄」；具有 STOCKTAKE 模組使用權者可看，不另設權限。自動歸檔後，當前選擇及相關表單清空，不繼續顯示已消失的作業明細。
- 沿用共用 Dialog、cy-op-table、ExpandToggle。主表日期 8%、單號 7%、初盤 7.5%、複盤 7.5%、盤點內容 70%；品號＋品名以「、」串接折行。展開區改用與門市訂購共用的 `StoreHistoryChain`，由舊至新呈現確認／寫回／清除歸檔，不顯示品項差異表或重複參與人員。
- 紀錄依盤點日期／ID DESC 每頁 10 張；展開直接使用已載入資料，沒有額外請求。差異摘要及原有 API 仍保留於資料保存契約，不在本視窗呼叫。不加背景輪詢、不把歷史塞進原 10／30 秒刷新，也不為總頁數 COUNT 全部歷史。
- 點背景不關閉，右上沒有 X，僅明確「關閉」。本機用真實元件及合成 API 預覽確認長內容折行、操作紀錄串與差異表移除；沒有登入或操作正式站。

## 檔案與契約

- `migrations/0055_stocktake_records.sql`；`shared/stocktake.ts`；`worker/http/stocktake-records.ts`、`store-stocktake-routes.ts`、`stocktake-erp.ts`、`erp-item-query-routes.ts`。
- `worker/backup/portable-backup.ts`／`schema-columns.ts`、`scripts/validate_schema.py`、`scripts/store-equipment.test.mjs` 同步新 migration／備份契約；未改舊 migration。
- `StocktakeRecordsDialog.tsx`、`StoreStocktake.tsx`、`store.css`、`change-log-labels.ts`；`scripts/store-stocktake.test.mjs` 增加歸檔真 Worker＋SQLite 交易／權限／分頁／備份測試。
- 盤點與 ERP bridge 架構、資料字典、共用元件目錄、VERSION／BUILD／package.json、CHANGELOG／TODO／handoff 索引同步。

## 跨 Repo 依賴與 rollout

- 配套需求交 Claude：舊 Win32 流程在 footer 總數未知時可能接受第一頁，零張又一律失敗，不能直接用舊結果判斷 ERP 清除。Agent 須有上限重讀，總數與實讀一致才回 `listComplete:true`，支援明確 0/0；讀不全／總數變動／超限停止。版本由 Claude 依當時 main 決定，不能把先前撤回的 V1.3.1 實作當成現況。
- 舊 Agent＋新 WEB 仍同步但不歸檔；新 Agent＋舊 WEB 忽略新增旗標。兩端都更新後才啟用完整歸檔；這是 protocol rollout 的最小相容窗口，正式最低支援 Agent 升級、舊 Agent 停用後可移除接受缺旗標的路徑，不另立平行同步邏輯。
- [CYapps PR #604](https://github.com/simonliu1118-byte/CYapps/pull/604) 已撤回 GPT 的 Agent 程式／測試／版本變更，相對原 main 僅保留 `apps/CYERPAutoQuery/WORK_HANDOFF.md` 及 [需求 handoff](https://github.com/simonliu1118-byte/CYapps/blob/cyerp/stocktake-complete-list-131/apps/CYERPAutoQuery/docs/handoff/CYERPAutoQuery-STOCKTAKE-ARCHIVE-HANDOFF-20261107.md)，交 Claude 處理。該 PR 不合併，不發行 Agent。WEB 先發布後，舊 Agent 可同步但不觸發自動歸檔，須待 Claude 完成配套並經使用者授權升級才生效。

## 驗證、風險及 Claude 接續

- 本機 TypeScript／`npm run build` 成功；初輪盤點／出機／備份三支相關測試 **61/61 通過**，追加超過 2^53 精確合計及差異分頁驗證後盤點為 34 項；最後盤點、UI、Audit 標籤、表單欄位及鍵盤相關合計 **51/51 通過**。涵蓋歸檔、回滾、舊旗標、全 skip、空清單、請求代次、單號重用、寫回中保護、分頁、多人多儲位小數及備份往返。
- 新元件使用共用表格樣式；合成畫面預覽不是正式資料驗收。尚待登入後桌機／手機與 ERP 真正空清單／翻頁驗收，不能用合成結果代稱正式驗證。
- 大量 200 張 × 3000 行的歸檔仍需受控壓測。固定 SQL 次數不等於 D1 不讀資料；必要的摘要／差異掃描與寫入仍有成本，不宣稱免費或無限負載。
- 先前撤回的 Agent 實作曾跑 Windows CI，不代表目前文件交接已完成 Agent；後續測試及實機驗收交 Claude。本輪 WEB `0c21a257` 完整 CI 已通過（Runtime Check `42346701942`、治理 `42346701928`、部署契約 `42346702005`）。
- 本輪 [WEB PR #443](https://github.com/simonliu1118-byte/chihyuan-web/pull/443)，程式提交 `323e5ffe`：完整 [Runtime Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42264333244) 通過，包含 source contracts、瀏覽器／Worker TypeScript、Local D1 runtime acceptance、Full Node test suite 與 Vite build；治理及部署契約檢查亦通過。本次追加交接證據，沒有程式改動；最新 head 狀態以 PR 為準。
- 已核對 [D1 batch 契約](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)：同批依序執行，失敗整批回滾。本機新歸檔測試使用真 Worker 路由＋SQLite 交易；CI 的既有 Local D1 驗收通過，不把它誇稱為新歸檔路徑的 Miniflare 專項測試。
- 沒有正式資料、ERP 匯出、憑證或 infrastructure ID 進 Git。Claude 最終審查待填，執行者不代填通過。重點請核對完整旗標、knownSheets 代次、原子保存後清除、精確量與備份、資料量、兩端相容以及待發布狀態。

## 2026-11-07 使用者 UI 返修

- 使用者確認：移除展開的品號／批號／帳面／初盤／複盤／實際／差異／填寫人員明細表；確認資訊改為門市訂購相同的小字紀錄串。
- `StocktakeRecordsDialog.tsx` 移除 Differences 元件、分頁及請求；初盤確認、複盤確認、寫回 ERP、ERP 已清除／移入紀錄依時間排序，缺事件不補造、缺人員只顯示時間及動作。移除重複參與者與歸檔前狀態小字，單號展開按鈕改標示操作紀錄。
- `StoreOperationHistory.tsx` 抽出無請求的共用 `StoreHistoryChain`，門市訂購原 chain layout 與盤點共用。沿用現有小字、粗體動作及箭頭連同下一筆整段換行 CSS；原 rows layout、排序及歷史讀取／快取不變。`store.css` 刪除不再使用的確認資訊樣式。
- 架構／共用元件目錄／CHANGELOG 同步。僅調整 UI，歸檔保存、差異摘要、schema、ERP Agent 不變；同一未發佈 PR #443 仍 VERSION=0.12.1／BUILD=0，未合併部署。
- 本輪 `npm run build`（含前後端 TypeScript）成功；盤點 UI／門市歷史／聯絡與日期相關測試 **22/22 通過**。本機真元件合成畫面已確認四事件、時間與動作、差異表不再顯示；新提交 CI 待 PR 執行，Claude 最終審查仍待辦。

## 2026-11-07 發布範圍更正

- 使用者明確指定 Agent 只交接、WEB 可合併部署。GPT 已撤回 CYapps 原程式及版本變更；未操作伺服器 Agent、未建立正式 Release，也不合併 CYapps PR。
- 本輪只更新 WEB 文件的配套狀態與授權界線，WEB 程式仍為已通過完整 CI 的 `0c21a257`。正式部署只從 main 的受控 `development-deploy.yml` 執行，版本 0.12.1／BUILD 0，包含 forward migration 0055；不另行手動刪除盤點資料。

## WEB 正式發布結果（2026-11-07）

- 使用者當次明確授權只合併部署 WEB；[PR #443](https://github.com/simonliu1118-byte/chihyuan-web/pull/443) 已合併，source=`4509f93ab6bd444f725cdebfdf0a2f9c36f7b1f5`。最終文件提交 `1167bf2f` 的完整 Runtime Check `42347544904`、治理 `42347544822`、部署契約 `42347544837` 全部成功。
- main-only [正式發布 #42347693527](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42347693527) 成功；本地及遠端 migration 0055 成功，未更改既有正式資源或手動刪除業務資料。
- 正式網域與 workers.dev 均回讀 HTTP 200、version=0.12.1、consumer=1.0.5、database=ok、source 為上述 SHA（UTC 06:36:53／台灣 14:36:53）。排程、HTTPS／靜態資源、正式網域、無效 session 及 canonical portal 檢查皆通過。
- CYapps #604 最終僅兩份文件：`WORK_HANDOFF.md` 與 `docs/handoff/CYERPAutoQuery-STOCKTAKE-ARCHIVE-HANDOFF-20261107.md`，維持 draft，未合併、未發行、未更新 Agent。自動歸檔仍等待 Claude 完成配套；WEB 紀錄介面已上線，舊 Agent 原同步可用。
- 本段與 TODO／CHANGELOG／索引為發布後文件證據，沒有程式／版本變更，不需再次部署；目前正式 source 不隨這份文件的合併 SHA 改寫。Claude 事後複審及登入／ERP 實機驗收仍待辦，不以 CI／部署代替。
