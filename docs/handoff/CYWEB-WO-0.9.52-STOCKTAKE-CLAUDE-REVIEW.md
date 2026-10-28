# CY Web WO-0.9.52 門市庫存盤點（第一階段）— GPT 工作紀錄／Claude 最終審查

- **狀態：GPT 開發中，尚未完成驗收；Claude 尚未審查，勿合併、勿部署。**
- 工單：[docs/development/work-orders/WO-0.9.52.md](../development/work-orders/WO-0.9.52.md)。
- 原工單 [PR #306](https://github.com/simonliu1118-byte/chihyuan-web/pull/306)：本分支建於**最新** `be85abdd5d6da17857394cc2f4dd75e3f3774966`（4 筆提交），已包含「資料清除後保留參與者／兩次確認／差異盈虧摘要、刪明細與逐列歷史」修正。2026-10-29 本輪重新唯讀查核時 PR 仍 Open，該 HEAD 無新增提交／討論回覆。
- 實作：`cyweb/store-stocktake`；基礎 `main` 為 `d775cac6e7dfb798e7981318047288b1f70a7a56`（V0.9.50）；目標 `0.9.52 Build 0`，V0.9.51 是另案 PR #305，不將它併進本分支。
- ERP 端另案：`CYapps/apps/CYERPAutoQuery/docs/work-orders/WO-1.3.0.md`（本對話未實作、不觸碰 CYapps）。

## 1. 最新原始工單與明確安全界線

完整採 [WO §0–§7](../development/work-orders/WO-0.9.52.md)；本階段只做到 `ERP_CONFIRMED`，不做 ERP 清除／盈虧處理／儲位更新／Excel／列印。三張使用者提出的舊底稿**不得**寫入 Migration 或任何自動忽略種子，部署後由使用者人工設定。

**2026-10-29 四筆 WO 提交更新（已讀）**：§2.13 要求最終 ERP 清除後只保留底稿編號／日期／參與者／兩次確認者與時間／ERP 完成時間／盈虧差異列；`stocktake_line_history` 應和明細一起刪。資料表分開保留，第二階段才實作清除及盈虧快照。這是目前架構不可破壞的前向條件，不是本版功能已完成。

## 2. 本輪逐檔工作紀錄（開發中）

| 檔案 | 已修改內容／目的 |
| --- | --- |
| `migrations/0030_store_stocktake.sql` | 擴張既有門市權限 CHECK 與 ERP 查詢類型 CHECK，保留 `not_before`／現有索引，新增 `stocktake_sheets`、`stocktake_lines`、`stocktake_line_history`、`stocktake_participants`。 |
| `shared/modules.ts` | 新增 `STORE_STOCKTAKE`、route `store`，與門市訂購採 grant-driven tab。 |
| `shared/erp-item-query.ts` | 新增 `STOCKTAKE_SYNC`、`STOCKTAKE_WRITE` 類型與顯示標籤。 |
| `shared/stocktake.ts` | 唯一共用狀態、模型、十進位字串 × 10⁴ bigint 與各品號合計／逐批寫回候選計算。 |
| `worker/http/store-stocktake-routes.ts` | 身分／Module／ADMIN 伺服器權限，清單／忽略／同步工作／重新整理／逐列樂觀鎖／修改歷史／參與者／新增批號與刪除／兩次確認／失敗重寫。COUNTING 下 `bookQty` 在序列化層不輸出。 |
| `worker/http/stocktake-erp.ts` | 嚴格驗證 ERP Agent 的 SYNC／WRITE payload、限額／seq／row key／數量字串、D1 atomic 完成語句。 |
| `worker/http/erp-item-query-routes.ts` | ERP grant、queue、claim、type target、progress、1800／3600 秒逾時，complete 時驗證並寫 `stocktake` 表而非永久 `result_json`。寫回逾時轉 `WRITE_FAILED`。 |
| `worker/index.ts` | 在現有門市訂購路由前註冊獨立已授權的 stocktake route。 |
| `worker/backup/schema-columns.ts`、`scripts/validate_schema.py` | 四張新表加入 portable schema parity，前者欄位排序與 migration 應由 CI 驗證。 |
| `src/runtime/modules/StorePage.tsx`、`src/App.tsx` | Module Access 驅動的門市第二頁籤；只有具 `STORE_STOCKTAKE` 權限時顯示。 |
| `src/runtime/modules/StoreStocktake.tsx`、`store.css` | 清單／狀態／管理操作／盲盤與複盤卡片／10 秒多人刷新／逐列即存與衝突提示／新增批號／歷史／手機 RWD 初版。 |
| `src/runtime/modules/useErpJob.ts`、`ErpJobStatus.tsx` | 將門市專用 API 排入的 ERP job 接回既有 poll／完成通知 owner，顯示寫入 x/y 列。 |
| `scripts/store-stocktake.test.mjs` | 合成 SQLite 與受保護 Worker route：權限、初盤 API 盲盤、不同列互不阻擋、同列版本衝突、新增批號限制、品號合計鎖定、WRITE rows、ERP SYNC claim/complete、避免通用 Audit 混入逐列資料。 |
| `docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md` | 新增兩種 ERP 協定，從 WO 原始段落引用至 specialized architecture。 |
| `docs/architecture/STORE_STOCKTAKE.md`、`docs/architecture/README.md` | 定義盤點狀態、資料權威、後續清除範圍與模組索引。 |
| `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md` | 目標 0.9.52；現行正式仍 0.9.50，新增工作保持未完成狀態。 |
| `docs/handoff/README.md`、本檔 | 新工作所有 GPT 變更放同分支，最終 Claude 逐檔審查。 |

## 3. 尚未驗證／不可宣稱完成之處

- [ ] **最新 HEAD GitHub CI、Worker typecheck、frontend typecheck、Source validations、local D1 migrations、可攜備份、一整套 Node tests** 尚未取得綠燈，需依錯誤逐項修正。
- [ ] `STOCKTAKE_WRITE` 全流程、Agent claim／complete 的 synthetic roundtrip，特別是 `WRITE_FAILED`、retry、逾時、空 rows 的 ERP 核對契約，需要更完整回歸。
- [ ] 低成本 D1 限額：最多 500 張已知底稿、每張 3000 列。單次超大量 SYNC 的 batch/response size 可能觸 Cloudflare D1 限制；未壓測，不能認定合法資料全規模無風險。
- [ ] Desktop 1440／Mobile 390 的 7 張指定畫面，無正式 mock／CI 截圖；目前僅完成 RWD source 初稿。
- [ ] UI 中逐列最後操作者目前以 member ID（非顯示名稱）呈現，需對照既有 app_members 及個資最小化政策調整。
- [ ] 型別、XML 風格 React／CSS Token、專用表單 keyboard、表單 Enter 及 10 秒刷新之脫鉤競態，須跑真 CI 並逐一修正。
- [ ] 同步後 ERP Windows 程式 **1.3.0** 尚需其他工單完成，不在本 PR 測試真實 ERP 或進行任何真庫存變更。
- [ ] 使用者要求的資料清除後保留「有差異列」快照屬第二階段，這次只建立能繼承它的資料表；若屆時要新增 snapshot 表，須 forward migration。

## 4. 安全與成本界線

- 開發僅寫 **Public Git 分支**（合成假品號／底稿）；不修改 main、不合併、不部署；不使用 Browser Use。
- **Cloudflare API、正式 D1、Worker、R2、GCS 及 ERP 寫入操作全數為 0**；只用 GitHub connector 讀檔與寫源碼。未取得正式 D1 rows-read／費用，不得估計精確成本。
- 逐列即存只寫盤點專用歷史，不在通用 Audit 寫入盤點數量；只記主管確認／同步／寫回狀態等單據事件。
- 請維持 server blind serialization；不能把 COUNTING bookQty 藏在前端但仍傳 JSON。
- 僅僅經過 CI 不表示使用者已核准合併／Worker deploy／ERP 真交易。

## 5. GPT 完成報告（待驗收後填）

- 開發完成 SHA：
- 新 PR：
- 完整 CI／local D1／Source 檢查：
- 安全 regression：
- 1440／390 截圖：
- 尚未完成及風險：
- 對 WO §6 各項達成情形：
- 已確實未合併／未部署：

## 6. Claude 最終審查（僅由 Claude 填）

- 審查日期／最新 HEAD：
- 結論：**待審查**
- 逐檔問題：
- 對 ERP 端 WO-1.3.0 協定核對：
- 可否合併：
