# CY Web WO-0.9.52 門市庫存盤點（第一階段）— GPT 工作紀錄／Claude 最終審查

- **狀態：15 項 synthetic Worker／SQLite 盤點測試已完成程式提交、CI 驗證進行中；桌機／手機實際渲染仍未驗證。Claude 尚未審查，PR #307 保留 Draft，勿合併、勿部署。**
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
- [x] **已加入 synthetic Worker + SQLite roundtrip**：WRITE 成功、全表差異含本次未寫列、FAILED 人工 retry、空 rows 仍須 INVI06 確認、3600 秒逾時、單張 refresh、STOCK 進度與單調性、忽略 stub 取消後首次同步、盲盤與最後編輯人；共 15 項測試在 `scripts/store-stocktake.test.mjs`，執行狀態見 §7。
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

## 7. GPT 本輪安全返修、測試與 Claude 補充（2026-10-29）

> 以下為 GPT 補充完成紀錄，**不代填 §6 Claude 結論**。原 WO #306 4 commits 與跨 repo WO-1.3.0 協定已再次唯讀比對，兩份協定文字一致；第二張 CYERPAutoQuery 工單沒有實作、合併、部署。

### 7.1 已提交的安全修正

1. **完整 ERP 核對差異**：`worker/http/stocktake-erp.ts` 修正把 `mismatches` 限定為「這次有寫入的列」的錯誤。INVR11 會核對整張底稿，未寫入的列也可能失配；現在先一次讀取該張底稿內最多 3001 列，核對 mismatch 的列鍵／序號／品號／批號；新增批號亦接受同次 ERP 已分配的 `erpSeq`。不合法 mismatch 一律拒絕 complete，ERP job 與 sheet 狀態都不會被偽確認。
2. **共用 Audit 隱私／資料量**：`worker/http/erp-item-query-routes.ts` 在 stocktake sync/write 完成 Audit 不再把 `keyword` 整份複製進共用稽核（WRITE 的 keyword 含逐列數量），只保留 queryType／目標／狀態／耗時／工作 ID；盤點逐列數量繼續留在可按第二階段清除的 stocktake 資料表。
3. **完成必須是真正 ERP 確認**：Agent `outcome=FOUND` 但 `confirmed=false`（INVR11 有差異、INVI06 未確認）時，job 與 sheet 均視為失敗，sheet 保留受權 `WRITE_FAILED`／mismatches，必須管理員再明確點「重新寫回」，不允許一般成功通知誤導為已完成。
4. **UI 最後操作者與重複送出**：Worker 在 bounded detail query 加 `app_members` LEFT JOIN，把初盤／複盤最後操作者顯示名稱附在目前有權限的結果中，UI 不再只寫「成員 ID」。Enter + onBlur 使用同步 in-flight Set 防同一列重複提交；保留 10 秒他人刷新及自身 draft。
5. **ERP 進度協定**：`STOCKTAKE_WRITE` 只接受 `stage=STOCK`，維持原 0≤done≤total 與同 stage 進度不倒退的 server guard。
6. **忽略 stub 再匯入**：修正先新增忽略、後來取消忽略而從未讀過明細的底稿，同步時原 SQL guard 過嚴導致失敗；現在可在未填任何數量的情況首次匯入，仍由伺服器保持盲盤。
7. **測試正確性**：初次新測試把「同品號總數相等、各批號分配不同」誤當不需 ERP 寫回，已修正：例如帳面 2+1、實盤 1+2 **應寫兩列**，只有逐批都相等才送 rows=[]。SQLite `node:sqlite` 查詢回傳 null-prototype row，測試改用一般物件比較，這不涉及正式程式行為。

### 7.2 合成 Worker + SQLite 測試

- `scripts/store-stocktake.test.mjs` **15 項**（測試入口 `scripts/ordering-route.test.mjs`，屬原有 Runtime Check）：授權、Worker COUNTING 盲盤、多列版本、批號限制、品號合計鎖定、同步／skip、WRITE confirmed、全表 mismatches、拒絕虛假 mismatch、WRITE_FAILED／retry、零 rows 確認、3600 秒逾時、受控重新整理、STOCK 進度／最後操作者、ignored stub unignore。
- 早期 CI 錯誤均已依 log 修正（新增測試與 schema 的整合進行中）；**本節不把舊 HEAD 的綠燈代替最新 HEAD 的證據**。最新 Runtime／TypeScript／本機 D1 等檢查須在最後一次 commit 完成後重新核對。
- 未經 Cloudflare MCP 或正式 ERP 做任何讀取／寫入，測試中的 D1 為合成 Node sqlite `:memory:`，資料為假底稿、假品號。

### 7.3 無法宣稱已通過的項目

- **1440px／390px 真正實際畫面截圖**：已完成響應式 CSS／卡片初稿，但本次執行環境沒有可用的 repo checkout／React 套件與可連 GitHub 的 clone；無法忠實渲染實際 CYWEB App，因此**不提供假的截圖**，要由 Claude 或具有工作樹的本地 Work 做真 Browser/Chrome 截圖。
- **規模與配額**：本輪已改為每張底稿以單一 `INSERT ... SELECT FROM json_each(?)` 整批寫入，不再有 3,000 條逐列 INSERT。新增 3,000 列可同步、3,001 列拒絕且保留盲盤的真 Worker／SQLite 測試。Cloudflare D1 官方文件 2026-10-24 的 SQL 執行限制為每個查詢最多約 30 秒；`db.batch()` 雖算一次讀取子請求，批次仍受 30 秒執行限制。200 張底稿 × 每張 3000 列（受 900 KiB JSON 上限另行約束）的實際 D1 測試未做，因此大規模 SYNC **可能超時，不可宣稱滿載合格**。參照 https://developers.cloudflare.com/d1/platform/limits/ 。必須在部署前由具合成 fixture 的獨立受控 CI/Work 壓測，必要時另訂 per-sheet 分批和失敗回復策略。
- `node --test scripts/*.test.mjs` 的**全數**驗證和原 WO 要求 7 張 1440/390 真正圖像尚未取得完整證據；CI 會覆蓋原 Runtime 定義的子集合。真實 ERP 寫回還待 CYERPAutoQuery WO-1.3.0 完成及使用者另行批准測試底稿。
- PR #307 **仍為 Draft，不可改 Ready、更不可自行合併／部署**；Claude §6 在全部門檻達成之前維持待審。
