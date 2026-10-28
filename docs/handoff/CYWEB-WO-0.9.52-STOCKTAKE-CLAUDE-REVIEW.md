# CY Web WO-0.9.52 門市庫存盤點（第一階段）— GPT 工作紀錄／Claude 最終審查

- **狀態：GPT 實作與離線驗收完成；正式交 Claude 最終審查。399/399 Node、五個 CI Job、七張真 Chromium 合成元件截圖已通過。PR #307 未合併／未部署；真 ERP、真 D1 大批量及正式登入整站仍未驗證。**
- 工單：[docs/development/work-orders/WO-0.9.52.md](../development/work-orders/WO-0.9.52.md)。
- 原工單 [PR #306](https://github.com/simonliu1118-byte/chihyuan-web/pull/306)：本分支建於**最新** `be85abdd5d6da17857394cc2f4dd75e3f3774966`（4 筆提交），已包含「資料清除後保留參與者／兩次確認／差異盈虧摘要、刪明細與逐列歷史」修正。2026-10-29 本輪重新唯讀查核時 PR 仍 Open，該 HEAD 無新增提交／討論回覆。
- 實作：`cyweb/store-stocktake`；基礎 `main` 為 `d775cac6e7dfb798e7981318047288b1f70a7a56`（V0.9.50）；目標 `0.9.52 Build 0`，V0.9.51 是另案 PR #305，不將它併進本分支。
- ERP 端另案：`CYapps/apps/CYERPAutoQuery/docs/work-orders/WO-1.3.0.md`（本對話未實作、不觸碰 CYapps）。

## 1. 最新原始工單與明確安全界線

完整採 [WO §0–§7](../development/work-orders/WO-0.9.52.md)；本階段只做到 `ERP_CONFIRMED`，不做 ERP 清除／盈虧處理／儲位更新／Excel／列印。三張使用者提出的舊底稿**不得**寫入 Migration 或任何自動忽略種子，部署後由使用者人工設定。

**2026-10-29 四筆 WO 提交更新（已讀）**：§2.13 要求最終 ERP 清除後只保留底稿編號／日期／參與者／兩次確認者與時間／ERP 完成時間／盈虧差異列；`stocktake_line_history` 應和明細一起刪。資料表分開保留，第二階段才實作清除及盈虧快照。這是目前架構不可破壞的前向條件，不是本版功能已完成。

## 2. 本輪逐檔工作紀錄（已提交，交 Claude 審查）

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

## 3. 驗收狀態、實機界線

- [x] [Runtime Check #40750528573](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40750528573) 五個 job 全部 `success`：source-contracts、browser-typecheck、worker-typecheck、build／Local D1、stocktake-visual。
- [x] `node --test scripts/*.test.mjs` **399/399 通過，0 失敗**；含 `scripts/store-stocktake.test.mjs` 的 17 項真 Worker + SQLite 合成測試、原專案合約與 Audit 中文對照回歸。
- [x] **1440px／390px 七張真 Chromium React 元件／專案 CSS 截圖**：Action #40750528573 的 artifact `stocktake-1440-390-visual-acceptance`（ID `12844265324`）。以假 API 驗證手機下拉、盲盤無帳面、複盤差異、主管確認、批號新增對話框、失敗寫回中文清單、無水平溢出。**未聲稱是正式登入後的完整 App Shell 截圖**。
- [x] 每列最後編輯人改為受權讀取的顯示名稱與時間；Enter／blur 不重複儲存，React／Worker typecheck、合成測試及視覺場景通過。
- [ ] **真 Cloudflare D1 大規模性能與配額**：本機已驗證每張 3,000 列，拒絕 3,001；未讀／寫正式 D1。200 張 × 每張 3,000 列大批量情境仍需另外限制、分批／受控測試，需 Claude 評估上線 gate。
- [ ] **Windows ERP 真實互通**：CYERPAutoQuery WO-1.3.0（PR #565）獨立處理；沒有真 INVR11／INVI14／INVI06 的回寫許可，也沒有正式庫存交易。
- [ ] **正式 CYID 登入、完整 App Shell 人工驗收**：本輪 Chromium 截圖是實際元件配合合成 API，非正式站；上線前仍需權限端到端與使用者人工驗收。
- [ ] **第二階段保留有差異列並清除明細**：只預留 sheet／participants／history 架構，尚未做 ERP 清除或盈虧快照（依 WO §2.13），不可誤認已完成。

## 4. 安全與成本界線

- 開發僅寫 **Public Git 分支**（合成假品號／底稿）；不修改 main、不合併、不部署；不使用 Browser Use。
- **Cloudflare API、正式 D1、Worker、R2、GCS 及 ERP 寫入操作全數為 0**；只用 GitHub connector 讀檔與寫源碼。未取得正式 D1 rows-read／費用，不得估計精確成本。
- 逐列即存只寫盤點專用歷史，不在通用 Audit 寫入盤點數量；只記主管確認／同步／寫回狀態等單據事件。
- 請維持 server blind serialization；不能把 COUNTING bookQty 藏在前端但仍傳 JSON。
- 僅僅經過 CI 不表示使用者已核准合併／Worker deploy／ERP 真交易。

## 5. GPT 完成報告（2026-10-29，正式交 Claude 審查）

- **PR / 分支**：[PR #307](https://github.com/simonliu1118-byte/chihyuan-web/pull/307)／`cyweb/store-stocktake`，base 是工單 [#306](https://github.com/simonliu1118-byte/chihyuan-web/pull/306)／`cyweb/wo-0.9.52-stocktake`；版號 **V0.9.52 Build 0**，原始工單 4 筆規格提交已全數讀取。V0.9.51 是另案未合併 PR #305。
- **已驗證程式提交**：`61d2ff7d95649e8c4fe598afe7eb0710f3f80a4d`；其後僅新增本輪 handoff／工單文件，Claude 仍應核對最新 PR HEAD。
- **CI**：[Runtime Check #40750528573](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40750528573) `success`，五 jobs（source-contracts、browser-typecheck、worker-typecheck、build、stocktake-visual）全數通過，含本地 D1 acceptance、Vite build。
- **完整 Node 測試**：`node --test scripts/*.test.mjs` 399 項全部通過、0 失敗。新增的 17 項盤點測試涵蓋盲盤、多人／版本、批號、兩次主管確認、ERP SYNC/WRITE 成敗與 retry、全表 mismatch、空 rows、timeout、進度與 3,000 上限。因原有 `audit-account-portal.test.mjs` 讀取 CYapps 共通 resolver，CI 在跑全套測試前唯讀 sparse checkout 公開 CYapps 指定 scripts；沒有修改另一張 ERP 工單。
- **真瀏覽器測試**：七張截圖皆為 Chromium 渲染真 React `StoreStocktake` 元件 + 正式 CSS，僅使用合成 API/品號/底稿；1440（盲盤、第一次確認、複盤、寫回失敗）及 390（盲盤、新增批號對話框、複盤）。[CI artifact `stocktake-1440-390-visual-acceptance`（ID 12844265324）](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40750528573)。已親自下載抽查截圖；mobile 無橫向溢出，寫回失敗顯示中文失敗列與 ERP 差異，非原始 JSON。
- **權限與資料**：`STORE_STOCKTAKE` Module Access，`ADMIN/SUPER_ADMIN` 主管確認，Worker 在 COUNTING 時不返回 `bookQty`，逐列 version／歷史／參與者，十進位整數倍數計算，完整 ERP 核對與失敗重試明確人為確認；四張新表納入可攜備份。
- **可靠度與成本**：修正忽略 stub 再讀、每人最多三筆 ERP queue、Audit 中文動作名稱、避免將 ERP 逐列寫入數量複製至共用 Audit、每張底稿 JSON1 批量 insert 降低 D1 工作量；CI 僅做 synthetic 3,000 列測試，未聲稱正式 D1 最大量通過。
- **依 WO §6 的項目**：授權頁籤、update/skip/ignore/refresh、盲盤、多人逐列編輯、批號規則、兩次主管確認、STOCKTAKE_WRITE 寫回資料與重試、390px 操作、Enter／日期四碼、Node／TypeScript／D1／build、VERSION／TODO／CHANGELOG／架構文檔，均已實作與離線驗收；正式 ERP 互通不是本工單模擬測試可取代的驗收。
- **未完成的外部驗證／Claude 判斷**：正式 Cloudflare D1 高併發 200×3,000 與配額、正式 CYID/整站 Shell 端到端、CYERPAutoQuery 1.3.0 Windows ERP 實機操作，需相應授權與設備。**禁止擅自連線正式 Cloudflare、真庫存寫入或部署。**
- **操作安全**：只修改本 feature branch；沒有合併 PR #306、#307，沒有部署，正式 Cloudflare Worker/D1/R2/GCS 及 ERP 全部未更動。Claude 審查結果只寫第 6 節，GPT 不代填審查結論。

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

- `scripts/store-stocktake.test.mjs` **17 項**（測試入口 `scripts/ordering-route.test.mjs`，屬原有 Runtime Check）：授權、Worker COUNTING 盲盤、多列版本、批號限制、品號合計鎖定、同步／skip、WRITE confirmed、全表 mismatches、拒絕虛假 mismatch、WRITE_FAILED／retry、零 rows 確認、3600 秒逾時、受控重新整理、STOCK 進度／最後操作者、ignored stub unignore。
- 早期 CI 錯誤均已依 log 修正（新增測試與 schema 的整合進行中）；**本節不把舊 HEAD 的綠燈代替最新 HEAD 的證據**。最新 Runtime／TypeScript／本機 D1 等檢查須在最後一次 commit 完成後重新核對。
- 未經 Cloudflare MCP 或正式 ERP 做任何讀取／寫入，測試中的 D1 為合成 Node sqlite `:memory:`，資料為假底稿、假品號。

### 7.2.1 追加 ERP 序號一致性（同輪）

- `worker/http/stocktake-erp.ts`：Agent `results[].ok=true` 必須提供有效 `erpSeq`；既有底稿列需與原 `seq` 相同，新增批號必須有 ERP 新配發的五位數序號，否則拒絕標記 `ERP_CONFIRMED`。避免 ERP 已確認但 CYWEB 新批號仍缺識別欄位的後續同步問題。
- `scripts/store-stocktake.test.mjs` 新增第 16 項，驗證新增批號缺序號被擋、回正確序號被接受、舊列錯序號被擋。
- `STOCKTAKE_SYNC` 大量匯入調整為經驗證 JSON1 單張 bulk insert，CI 對 3,000 列合成資料已建立測試；**正式 Cloudflare D1 30 秒限制仍須另外驗證**。

### 7.2.2 ERP 排程上限回饋

- 門市盤點專用路由在 `STOCKTAKE_SYNC` 和主管 `STOCKTAKE_WRITE` 提交前，唯讀查同一成員的 `QUEUED/RUNNING` 工作量；已達既有「每人最多三筆」時明確回 **409 `ERP_QUEUE_LIMIT`** 並提示等待，不再誤回泛用不可用錯誤。D1 batch 內原先的原子 quota guard **仍保留**，並發請求不能藉此繞過限制。
- `scripts/store-stocktake.test.mjs` 已增第 17 項：連續三筆建立可用，第四筆 409、沒有新增排程工作。

### 7.2.3 最新合成驗證完成紀錄

- **程式與 17 項測試完成 SHA**：`1ed51608b5ca529e9f79cb9cdee7cb9e7fcb05c0`（本輪最後程式提交後更新 handoff 的 SHA）。
- [Runtime Check #40748024167](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40748024167)：**success**。其四個 jobs **source-contracts、browser-typecheck、worker-typecheck、build** 均 `success`，涵蓋 `scripts/store-stocktake.test.mjs` 的 17 項合成 Worker+SQLite 測試，以及原本本機 D1 Runtime acceptance／Vite build。
- 本段後續為文件紀錄更新，不改動 Worker／React 程式；若本文件新 HEAD 又觸發 CI，Claude 審查時仍需核對最新提交狀態。
- **未宣稱**真 ERP 寫入、Cloudflare 生產 D1、1440/390 真實截圖、完整 wildcard Node suite 已驗收。

### 7.3 最終視覺驗收、完整回歸與外部風險（取代前段 WIP 狀態）

- **實際 Chromium**：測試專用 `scripts/stocktake-visual/{index.html,main.tsx,capture.mjs}` + `vite.stocktake-visual.config.ts` 不載入 Cloudflare plugin、不連正式 API，渲染真 React 元件和共用 CSS；七張畫面截圖及無水平捲軸等斷言存於 [#40750528573 artifact](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40750528573)。這是合成資料的**元件級**視覺驗收，非正式 CYID 登入後整站畫面。
- **UI 補強**：初盤盲盤的主管第一次確認不再虛構差異品號數；手機清單改上方下拉、選中底稿用標準 accent token；ERP 寫回失敗顯示中文錯誤列與 mismatch，非 JSON 技術資料；Modal 截圖固定 viewport 高度，避免 full-page 擷取導致背景下方變亮的假象。
- **全量 Node suite**：CI 增加 `node --test scripts/*.test.mjs`，並只讀公開 CYapps 的 Canonical identity resolver 供其原有測試，399/399 全綠。此舉也抓出盤點 Audit 中文動作標籤缺漏，已在 `src/runtime/modules/change-log-labels.ts` 補上八個對應。
- **CI 受控成本**：Chromium visual job 限定 feature branch PR，run 15 分鐘上限，所有輸入是 synthetic GET；未在正常 deployment workflow 增加會觸碰 Cloudflare 的步驟。
- **待 Claude 風險審查**：D1 批次 30 秒、Agent complete 900 KiB、最多 200 底稿與每張 3,000 行的全規模邊界尚未實測真 Cloudflare。請決定是否需更小單次批量、逐張工作或提前標示限制，避免完成 PR 後誤當正式 D1 已滿載驗證。
- **跨 repo 邊界**：WO-1.3.0（CYapps PR #565）規格協定文字已與本工單比對一致；此 PR 只實作 CYWEB，沒有做 Windows ERP 自動寫回、授權或部署。第二階段資料清除／盈虧明細仍另案。

## 8. Claude 審查建議核對順序（由 GPT 提供，審查結果只寫 §6）

1. 先確認 Migration 0030／四張表／portable backup schema、已使用資料不遭覆寫。
2. 檢查 COUNTING 盲盤、逐列 optimistic conflict、兩次確認、INVR11 全表 mismatch、ERP `confirmed` 與新增批號 `erpSeq`，及 Audit 敏感欄位最小化。
3. 對照 CYapps WO-1.3.0 合同；Windows Agent 真 ERP 操作只許在另案核准後驗證。
4. 查看 399/399 全量 Node 測試、五個 CI job、七張 1440/390 截圖（合成 fixture），確認 mobile 下拉與失敗清單。
5. 判斷 200×3,000 的 Cloudflare D1 大批次限制是否需要部署前的額外 gate；不得以測試 green 冒稱真 Cloudflare 配額已驗證。
6. 最後才作出 PR #307 可否合併的審查決議。GPT 沒有自行合併、部署或真 ERP 寫回。
