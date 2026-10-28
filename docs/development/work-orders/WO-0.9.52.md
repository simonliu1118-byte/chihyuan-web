# WO-0.9.52 門市「庫存盤點」：盲盤、複盤、寫回 ERP（第一階段）

- 狀態：待執行
- 分支：cyweb/store-stocktake　PR：#<編號>（執行者填）
- 對應：CYapps `apps/CYERPAutoQuery/docs/work-orders/WO-1.3.0.md`（ERP 端，同一份協定）
- 版號：0.9.52 Build 0；若開工時 0.9.52 已被其他 PR 使用，順延到下一個未用版號並在完成報告註明。

## 0. 執行限制
- 只在指定分支提交並開 PR；**不合併、不部署**，完成後交 Claude 審查。
- 測試、文件、截圖只用假資料（品號 X0001、底稿 990001 之類），不得放入真實底稿編號、品號、數量或 ERP 匯出檔。
- 不改 `REPOSITORY_RULES.md`／`REPO_POLICY.md`／`PROJECT_RULES.md`。

## 1. 背景（使用者原話，2026-10-29）
- 「我要新增一個庫存盤點功能，他會牽涉到ERP查詢，這個庫存盤點要放在業務模組:門市 新開一個頁籤」
- 「他會有個更新盤點單的按鈕…要記住已經跑過的盤點單，之後再更新就只讀新的，也可以多做重新整理按鈕是針對特定盤點單去重新讀一次。前面250202/260102/260901請設為忽略。」（這三張由使用者部署後在畫面設為忽略，不寫進程式或 migration。）
- 「盤點數量是ERP的帳面庫存，要先盲盤，初盤完之後由管理員權限確認才把盤點數量秀出來並顯示差異數，讓門市人員去複盤」
- 「同一個品號有多個批號要逐批號填」「要可以讓點的人新增某品項的批號(要原本就有批號的才能新增批號)並輸入數量」
- 「這個要邊填邊存並支援多人同時使用同個盤點表一起填寫不同位置，要記錄誰填什麼時候填以及修改」
- 「都完成之後門市人員會主動請主管(管理員)去確認，確認之後差異數會列出來，沒有差異的鎖定(包括批號加總數量沒問題比如說初盤是1+2、帳面是2+1這樣視為沒問題)，有差異的列表請門市人員複盤再填寫複盤數量，帳面數量會秀出來讓門市人員看的到。複盤完成之後管理員會再來按確認」
- 「寫回ERP的數量，沒有複盤也就是數量沒問題的，就不需要寫入。」「批號數量不同但總數相同需要寫入，把系統內的各批號數量更正為實際數量」
- 「第二次管理員確認後自動寫回ERP」「仍有差異的品項照複盤數寫，因為這就是實際數量」「程式核對全部相符之後按」（INVI06 確認）
- 確認之後還有：盤點盈虧明細表、盤點資料更新作業、核對庫存異動的盤點單、（視需要）核對品號庫存、盤點資料清除作業，「才會完成單次盤點工序」——**第二階段另開工單，本單只做到 ERP 確認並預留狀態**。

## 2. 已定案事項
1. **位置與權限**：門市頁（`StorePage`，route `store`）新增第二個頁籤「庫存盤點」。新 Module Access `STORE_STOCKTAKE`「門市庫存盤點」（有此權限即可看全部盤點單、填初盤／複盤、按更新）。**管理員確認、設為忽略、重新整理**另需 Workspace Role `ADMIN` 或 `SUPER_ADMIN`。
2. **盤點單狀態**（`stocktake_sheets.status`，本階段只用這些，第二階段再用 forward migration 擴充）：
   `IGNORED`（忽略）→ `COUNTING`（初盤中）→ `RECOUNTING`（複盤中）→ `WRITING`（寫回 ERP 中）→ `WRITE_FAILED`（寫回失敗，可重試）→ `ERP_CONFIRMED`（ERP 已確認；第一階段終點）。
3. **盲盤**：`COUNTING` 期間**任何人**（含管理員）的 API 回應都不含帳面數量；由 Worker 保證，不能只靠畫面隱藏。
4. **逐批號填寫**：每列＝ERP 底稿一列（品號＋批號），填「初盤數量」；沒有批號的品號就是一列。
5. **新增批號**：只能對「本底稿上已有非空批號的品號」新增；同一底稿同品號不可重複批號；新增列帳面視為 0、標示「新增」。新增列只在 `COUNTING`／`RECOUNTING` 可新增或刪除（有數量的新增列刪除前要確認）。
6. **邊填邊存、多人同時填**：每列獨立儲存（離開欄位或 Enter 即存，失敗保留輸入並提示），附該列 `version` 做樂觀鎖；衝突時顯示對方填的值與人、時間，由使用者選擇覆蓋或採用。每列顯示最後填寫人與時間；每次寫入記 Audit（前後值、操作者、時間），可在列上看修改紀錄。畫面每 10 秒更新他人填寫結果（不覆蓋自己正在輸入的欄位）。
7. **第一次管理員確認**（`COUNTING` → `RECOUNTING`）：所有列都要有初盤數量（空白列數不為 0 時不能確認，提示還有幾列）。以**品號**比較「初盤合計」與「帳面合計」：相等的品號所有列鎖定（不需複盤）；不相等的品號所有列開放複盤。確認後帳面數量與差異（初盤－帳面，逐列與品號合計）對所有人顯示。
8. **複盤**：只有開放複盤的列可填「複盤數量」（同樣邊填邊存、多人、紀錄）；可在這些品號下新增批號。
9. **第二次管理員確認**（`RECOUNTING` → `WRITING`）：開放複盤的列都要有複盤數量。每列「實際數量」＝有複盤數量用複盤，否則用初盤。**逐批號**：實際 ≠ 帳面的既有列，加上全部新增批號列，送 `STOCKTAKE_WRITE` 工作（自動送出，不另按鈕）。若沒有任何列需要寫入，仍送工作（rows 為空），讓 ERP 端做 INVR11 核對與 INVI06 確認。
10. **寫回結果**：`confirmed=true` → `ERP_CONFIRMED`，記錄完成時間；否則 → `WRITE_FAILED`，畫面列出每列失敗原因與 `mismatches`，管理員可按「重新寫回」（再送同樣的 rows，ERP 端寫入相同數值是安全的）。新增批號列收到 `erpSeq` 後存起來。
11. **讀盤點單**：「更新盤點單」送 `STOCKTAKE_SYNC`（`skipSheets`＝所有已存在的底稿，含忽略；`onlySheet`=null）。「重新整理」（只在 `COUNTING` 且尚無任何人填數量時可用）送 `onlySheet`。清單中出現但未讀明細的底稿不存在（更新模式會把未 skip 的都讀完）。重新整理時以 `seq` 對應更新 ERP 欄位與帳面；ERP 少掉的列刪除（因為尚無人填）。
12. **忽略**：管理員可把底稿設為忽略（`IGNORED`，不再出現在清單、更新時 skip）或取消忽略（取消後回到 `COUNTING`；若從未讀過明細，下次更新會讀）。為了讓使用者能在第一次更新前就設好忽略，提供「新增要忽略的底稿編號」輸入（建立一筆只有編號、狀態 `IGNORED` 的底稿）。
13. **協定**：見下方，兩張工單必須完全一致；欄位名稱、上限、逾時不得自行更改。

### 協定（兩張工單共用，兩邊必須完全一致）

新增兩種 ERP 查詢類型，走既有 `/api/erp-agent/item-queries/claim`／`/complete` 與 CY Web 排程佇列（每人 3 筆、依送入時間、暫停時可加入佇列等既有規則一律適用）。所有數量在 JSON 中一律為**數字字串**（ERP 顯示值，可為負數、可有小數），日期 `YYYY-MM-DD`。

**`STOCKTAKE_SYNC`：讀盤點單（INVR11）**

- claim：`{ id, queryType:"STOCKTAKE_SYNC", expiresAt, skipSheets: string[], onlySheet: string|null }`
  - `skipSheets`：CY Web 已讀過或設為忽略的底稿編號（最多 500 個）。
  - `onlySheet`：不為 null 時是「重新整理」，只讀這一張（即使它在 skip 內）。
- complete（`outcome` 為 `FOUND`／`NOT_FOUND`／`FAILED`，共通欄位同其他類型）：
  - `sheets: [{ sheetNo, date }]`：F2 開窗清單看到的**所有**底稿（最多 200 筆）。`onlySheet` 模式可只回該張。
  - `details: [{ sheetNo, rows: [...] }]`：這次實際讀了明細的底稿（`onlySheet` 模式恰好一張；更新模式＝清單中不在 skip 的每一張）。
  - `rows` 每列（最多 3,000 列／張）：`{ seq, itemCode, itemName, spec, warehouseName, location, unit, batch, bookQty }`。`seq` 為 INVR11 的「底稿序號」（5 位數字字串，張內唯一）；`bookQty` 為 INVR11 的「盤點數量」（ERP 預設帶入帳面數量）；`location`、`batch` 可為空字串。
  - `NOT_FOUND`：沒有任何需要讀的底稿（清單全在 skip 內）；此時仍回 `sheets`、`details:[]`。
- RUNNING 逾時 1,800 秒；complete 上限 900 KiB。

**`STOCKTAKE_WRITE`：寫回 ERP（INVI14 逐筆、INVI06 新增批號與確認）**

- claim：`{ id, queryType:"STOCKTAKE_WRITE", expiresAt, sheetNo, rows: [...] }`
  - `rows` 每列（最多 3,000）：`{ key, seq, itemCode, batch, quantity }`。
    - 既有列：`seq` 為底稿序號、`key` 同 `seq`。
    - 新增批號：`seq` 為 null、`key` 為 CY Web 的列鍵（例如 `N0001`）。
  - 只送「實際數量 ≠ 帳面數量」的既有列，以及全部新增批號列（規則見 CY Web 工單 §2）。
- complete：`{ outcome:"FOUND"|"FAILED", sheetNo, results:[{ key, ok, erpSeq, message }], confirmed, mismatches:[{ key, seq, itemCode, batch, expected, actual }] }`
  - `results` 每列一筆：`ok` 表示已寫入並讀回一致；新增批號列的 `erpSeq` 為 ERP 新產生的序號（既有列同 `seq`）；失敗時 `message` 為給人看的短句（不含路徑或帳密）。
  - `confirmed`：INVR11 核對全部一致，且已在 INVI06 按「確認」。
  - `mismatches`：INVR11 核對時不一致的列（有任何一列就不得按確認）。
- RUNNING 逾時 3,600 秒；complete 上限 900 KiB。
- Agent 每寫完一列以既有 `POST /api/erp-agent/item-queries/{id}/progress` 回報 `{ stage:"STOCK", done, total }`，CY Web 顯示「已寫入 x / y 列」。

## 3. 範圍
1. Migration `0030_store_stocktake.sql`（若編號已被使用則順延）：
   - `app_member_module_access.module_code` CHECK 加入 `STORE_STOCKTAKE`（照 0029 的重建方式）；`erp_item_queries.query_type` CHECK 加入 `STOCKTAKE_SYNC`、`STOCKTAKE_WRITE`（照 0019 的重建方式，保留全部欄位與索引）。
   - `stocktake_sheets`：`sheet_no` PK、`sheet_date`、`status`（CHECK 上述六種）、`detail_read_at`、`first_confirmed_by/at`、`second_confirmed_by/at`、`write_query_id`、`write_result_json`、`erp_confirmed_at`、`version`、`created_at`、`updated_at`。
   - `stocktake_lines`：PK(`sheet_no`,`line_key`)；ERP 欄位（`seq`、品號、品名、規格、庫別名稱、儲位、單位、批號、`book_qty` TEXT）；`is_added`、`erp_seq`；`first_qty`／`first_by`／`first_at`、`recount_qty`／`recount_by`／`recount_at`；`locked`；`version`。數量以十進位字串保存並在 Worker 驗證（最多 4 位小數、絕對值 < 1e9）。
   - 兩張表都是人填的資料，**納入可攜備份**（更新 `worker/backup/schema-columns.ts`，`validate_schema.py` 會比對）。
2. `shared/modules.ts`：`STORE_STOCKTAKE`（route `store`，label「門市庫存盤點」）；門市頁有任一門市權限即可進入，頁籤依權限顯示。
3. Worker：
   - `worker/http/store-stocktake-routes.ts`（新檔）：清單、單張明細（依狀態決定是否回帳面）、填寫（初盤／複盤，含 version）、新增／刪除批號列、兩次確認、忽略／取消忽略／新增忽略編號、更新與重新整理（建立 ERP 工作）、重新寫回、單列修改紀錄。所有寫入同一 D1 batch 記 Audit。
   - `worker/http/erp-item-query-routes.ts`：兩種新類型（`MODULES_FOR_TYPE`、parseRequest、claimedJob、complete 驗證與落地、逾時、`/progress` 接受 `STOCKTAKE_WRITE`、佇列顯示 target）。STOCKTAKE 結果**直接寫入 stocktake 表**（與 complete 同一 batch，比照 RESTOCK 的 `erp_sales_*`），不放 `result_json`。complete 驗證：底稿編號 1～20 位英數、`seq` 5 位數字、張內 seq 不重複、數量為數字字串、`STOCKTAKE_WRITE` 的 `results` key 必須都屬於該工作。
   - `shared/erp-item-query.ts`：類型與標籤（「盤點單更新」「盤點寫回」）。
4. 前端：
   - `StorePage` 加頁籤「庫存盤點」；新元件（例如 `StoreStocktake.tsx`）。左側（手機為上方下拉）是盤點單清單（編號、盤點日期、狀態、已填／總列數），上方「更新盤點單」按鈕與工作狀態（沿用 `useErpJob`／`ErpJobStatus`，完成會通知）。
   - 明細：可依儲位、品號、品名、批號搜尋；篩選「未填」「有差異」「新增批號」；依儲位排序（同儲位的人一起填）。每列：品號＋品名（同一行）、規格、儲位、批號、單位、初盤輸入、（確認後）帳面、差異、複盤輸入、最後填寫人／時間、修改紀錄。數字欄可用鍵盤 Enter 往下一列。
   - 管理員按鈕：第一次確認、第二次確認、重新整理、設為忽略、重新寫回；確認前用共用確認視窗顯示摘要（列數、未填、需複盤品號數／需寫入列數）。
   - 手機 390 寬可完整操作（門市人員會拿手機邊走邊點）：每列卡片化，數量輸入用數字鍵盤。
5. 文件：`ERP_ITEM_QUERY_BRIDGE_CONTRACT.md` 加「庫存盤點（V0.9.52）」一節（協定照抄）；新增 `docs/architecture/STORE_STOCKTAKE.md`（狀態、規則、資料表）；`docs/architecture/README.md` 索引；TODO 段落（連結本工單）；VERSION／package.json。

## 4. 不做
- 第二階段：盤點盈虧明細表、盤點資料更新作業、核對庫存異動盤點單、核對品號庫存、盤點資料清除作業（狀態與資料表要能往後接，但本單不做畫面與協定）。
- 儲位更新（使用者之後另外說明）。
- 新增「本底稿沒有的品號」（只允許新增既有批號品號的新批號）。
- 匯出 Excel、列印。

## 5. 實作指引
- 門市頁的頁籤與樣式沿用 `StorePage.tsx`／`store.css`；ERP 工作沿用 `useErpJob`（home 用 route `store`、key `STOCKTAKE`），完成通知、排程佇列、暫停時加入佇列都自動適用。
- 盲盤在 Worker 的序列化函式處理（依 sheet status 決定是否輸出 `bookQty`、差異），並寫測試證明 `COUNTING` 時 API 回應完全沒有帳面欄位。
- 品號合計比較用十進位字串轉整數倍數（×10⁴）避免浮點誤差。
- 多人同時：參考叫貨的逐列儲存與 `expectedVersion`（`ordering-routes.ts`）。
- Audit：entityType `stocktake`，entityKey `<sheetNo>/<lineKey>`；動作：first_count、recount、line_added、line_removed、first_confirmed、second_confirmed、ignored、unignored、write_requested、erp_confirmed、write_failed。
- 測試（`scripts/` 新增 `store-stocktake.test.mjs`，用假資料跑真 Worker routes＋SQLite）：權限（無權限 403、非管理員不能確認）、盲盤、新增批號規則、版本衝突、第一次確認的品號合計鎖定（含 1+2 對 2+1）、第二次確認送出的 rows 正確（逐批號、含新增列、不含相同列）、SYNC 落地與 skip、重新整理對應、WRITE 成功／失敗狀態、可攜備份欄位。

## 6. 驗收清單
- [ ] 門市頁出現「庫存盤點」頁籤，只有 `STORE_STOCKTAKE` 權限的人看得到；權限設定頁可勾選。
- [ ] 「更新盤點單」送出 `STOCKTAKE_SYNC`，skip 含全部已知與忽略底稿；完成後清單出現新底稿。
- [ ] 可先輸入要忽略的底稿編號；忽略的底稿不出現在清單、更新時 skip。
- [ ] `COUNTING` 時任何人的 API 回應都沒有帳面數量（測試證明）。
- [ ] 兩人同時填同一張不同列互不覆蓋；同一列衝突會提示；每列顯示最後填寫人與時間、可看修改紀錄。
- [ ] 新增批號只限已有批號的品號，不可重複。
- [ ] 第一次確認：未填完不能確認；品號合計相等的鎖定（1+2 對 2+1 也鎖定）；帳面與差異出現。
- [ ] 第二次確認：自動送 `STOCKTAKE_WRITE`；rows＝逐批號實際≠帳面的既有列＋全部新增列。
- [ ] 寫回成功 → `ERP_CONFIRMED`；失敗 → `WRITE_FAILED` 顯示原因，可重新寫回。
- [ ] 手機 390 寬可完整填寫。
- [ ] 固定項目：新表單 Enter 跳下一欄、日期四碼年份（`form-keyboard.test.mjs`）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過；`node --test scripts/*.test.mjs` 通過。
- [ ] VERSION／package.json、TODO、CHANGELOG、文件已更新。

## 7. 截圖要求
- 桌機 1440：清單＋初盤中明細（看不到帳面）、第一次確認後（帳面、差異、鎖定列）、複盤中、寫回失敗畫面。
- 手機 390：初盤填寫、新增批號。

## 8. 完成報告（執行者填）

## 9. 審查紀錄（審查者填）
