## 第二輪 CI 最終結果（2026-10-30）

- [GitHub Actions Runtime Check #40940708273](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40940708273) `completed / success`，驗證程式 SHA `a1b81b3ddb89bf9471bfb76ef3b5df6583355af1`。
- 4 個工作均成功：`browser-typecheck`、`worker-typecheck`、`source-contracts`、`build`。build 內含本機 D1 驗收、完整 Node 測試（包括新增 `scripts/store-stocktake-ui.test.mjs`）、Vite 打包。
- 前兩輪 CI 失敗分別因 Enter 共用鍵盤規範及 Field/FormSection 共用表單規範，均已按既有設計修復；最新程式版全部通過。
- 此後只更新本 Handoff 文件，不變更已測試的程式檔。PR #314 仍 Draft，尚未合併、尚未部署。瀏覽器實際視覺檢查與互動驗收仍列為 Claude 複審工作，不得把 CI 當成實際截圖驗證。

---

## 第二輪補充：共用表單元件治理檢查

- 修正 Enter 鍵後，Runtime Check run `40940419218` 的 browser typecheck、source contracts、worker tests 通過，但完整 Node 測試的 `scripts/form-fields.test.mjs` 擋下表單中的原生 `<label>`，要求所有業務表單必須沿用共用 `Field` / `FormSection`。
- `cf0bf631`：`StoreStocktake.tsx` 改以共用 `Field required size="l"` 包住唯一輸入，`FormSection` 布局，按鈕仍位於輸入框右側。
- `a1b81b3`：`store.css` 對共用欄位提供局部 flex 寬度與底部對齊，不覆寫其他表單。
- 最新 CI 需以 `cf0bf631`／`a1b81b3` 之後的版本為準；此段記錄既有失敗與修正，保留給 Claude 複審。

---

## 2026-10-30 CI 發現與修正（第二輪補充）

- 新增的單欄位忽略底稿輸入表單，首次 Runtime Check `40940260959` 的 worker-typecheck／Identity adapter regression tests 階段被共用 `scripts/form-keyboard.test.mjs` 擋下：所有資料輸入表單必須使用既有 Enter 導覽處理器。
- `2e488897`：`src/runtime/modules/StoreStocktake.tsx` 的忽略底稿表單補上既有 `enterAdvancesThenSubmits`，可在輸入編號後按 Enter 直接送出，符合共用鍵盤與表單規範。沒有修改忽略清單 API。
- **首次 CI 的失敗不等於最新 SHA 的失敗；必須重新看 `2e488897` 之後的最新 CI 結果。** Claude 應保留此過程，複審鍵盤操作及成功新增時 Dialog 不關閉。

---

# 2026-10-30 盤點 UI 第二輪（Claude 後續複審必看）

## 使用者最終確認需求

1. **同步完成通知**必須使用 ERP 查詢現有**右上角**綠色 Toast（有「查看」按鈕）；只在使用者確實執行的同步工作結束時通知，載入歷史結果、重新整理、進入頁面都不能跳一次。不得再用 `useFeedback` Alert Dialog 代替 Toast，也不要在「已排入佇列」時發完成通知。
2. 左側入口改 **「設定忽略底稿」**。對話框寬度從 620px 縮窄 20% 為約 **496px**；「新增」按鈕放輸入框右方；移除底部「取消」，保留右上角 X；成功新增後保持對話框開啟、清空輸入、更新清單。
3. 已忽略清單改用叫貨共用 `cy-op-table` 樣式（不是另一套 `DataView` 視覺）；保留底稿編號、加入時間、單項「移除」。
4. 左側盤點清單完全採用叫貨共用 `cy-op-list`、`cy-op-list-row`、`cy-status-row`、`StatusChip`，三項**同一行**：左底稿編號、中 `2026/10/28盤點`、右狀態 Pill。**不顯示** `0/47 列已填寫` 等進度。右側明細仍可顯示填寫進度。
5. Windows QUERY、Worker API、資料庫、忽略排除規則這一輪均不修改。

## 變更與 Commit SHA

| Commit | 檔案 | 具體修改 |
|---|---|---|
| `96ec696b` | `src/runtime/modules/useErpJob.ts` | 在共用 `ERP_QUERY_DONE_EVENT` 增加 `queryType`，仍沿用 `sawRunning` 防止歷史結果重播通知 |
| `3397f29e` | `src/App.tsx` | `STOCKTAKE_SYNC` 即使盤點頁可見也走全域 `useToastQueue` + `ToastRegion`；其他 ERP 查詢仍只在頁面隱藏時 Toast；查看導航走門市 |
| `81904c75` | `StoreStocktake.tsx` | 移除原本依 `job.result` 跳 Dialog（重整重播的根源）；移除同步排隊即通知；叫貨清單、日期、狀態 Pill、手機 select 不再顯示進度 |
| `0664f651`, `4dfb1c0f` | `StoreStocktake.tsx` | 496px 忽略視窗的配套 JSX、輸入框右側「新增」、無取消按鈕；共用 `cy-op-table`；新增成功保留視窗 |
| `c0043fe9`, `411af305`, `71932fec` | `store.css` | 修改左欄寬至約 330px，三欄同列 CSS、Dialog 局部縮窄及手機表格，調高覆寫選擇器優先度；樣式集中在原 `store.css` |
| `529f509c`, `45bac79b` | `scripts/store-stocktake-ui.test.mjs` | 新增 Toast 事件觸發防重播、共用清單結構、忽略視窗佈局的 source contract 回歸檢查 |

狀態色：初盤中／寫回中 info（藍）、複盤中 warning（黃）、寫回失敗 danger（紅）、ERP 已確認 success（綠）；依現有 `StatusChip` 語意。

## 驗證、風險及 Claude 複審要求

- 新版 PR 需由最新 SHA 的 Governance Check、Runtime Check、部署 dry-run 結果證明；本節記錄時 CI 尚未完成。
- 測試腳本的 source contract 僅是基本回歸保護，**不能取代**實際瀏覽器視覺檢查。
- 複審「重新載入已完成 ERP Job 不 Toast」與「新同步在完成時恰好一筆右上角 Toast」；跑不同查詢頁不應因本改動改變原有通知規則。
- 複審 330px 左欄在窄桌機下的三欄同列與狀態 Pill 是否截斷；手機 select、496px Dialog、清單表格、鍵盤 Enter、刪除確認須正常。
- 檢查 `useErpJob` 的 `STOCKTAKE_WRITE` 不被誤當成同步完成。
- **此輪不會自行合併／部署**；等使用者後續批准。原 2026-10-30 部署成功記錄屬前一輪版本，不代表這輪已部署。

---

## 2026-10-30 已合併並完成開發環境部署（供 Claude 事後複審）

- 使用者明確批准合併並部署，仍要求保留 Handoff 交 Claude 複審。
- PR #313: https://github.com/simonliu1118-byte/chihyuan-web/pull/313 ，已合併 main。
- Merge SHA: `7f43a50a3e67dd48ef044488805709d96ec87f83`。
- 開發部署分支 `deploy/cyweb-development` 更新至完全相同的 main SHA，遵守 `DEPLOYMENT_SOURCE_MUST_MATCH_CURRENT_MAIN`。
- GitHub Actions CY Web Deploy run: https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40926268529 ，最終 `completed/success`，包含遷移、Worker 部署、HTTPS/static 與部署後權限檢查。
- 所有原先的修改與待審內容仍在本文件；Claude 複審不因部署成功而省略。請注意此記錄是部署完成後的文件補記，非重新發行程式。

---

## 2026-10-30 使用者批准合併及部署，Claude 後續複審保留

- 使用者明確改為允許 PR #313 合併 main 並部署，但**仍要求保留完整 Handoff 供 Claude 事後複審**。
- 合併前確認 PR #313 mergeable=true、clean；前次 `87066760` 的 Runtime Check、Governance Check、PR deploy dry-run 均成功。
- 原本開發分支部署提交 `19a44060` 的驗證成功，但因 `DEPLOYMENT_SOURCE_MUST_MATCH_CURRENT_MAIN` 被安全檢查拒絕真正發布；本次遵循安全流程先合併 main 再發布。
- 部署後應補記 merge SHA、開發部署 workflow run、health 結果。Claude 仍需複審：獨立忽略清單與 legacy IGNORED 遷移、同步佇列競態、備份資料表覆蓋、手機 UI，以及用戶要求的查詢完成通知。

---
## 2026-10-30 開發部署執行紀錄

- 使用者明確批准**部署但不合併**。
- PR #313 的檢查提交 `8706676046b83ff1d5b748c9a7e692761d4dd1e3`：Governance Check、Runtime Check、CY Web Deploy 的 pull_request 驗證皆成功。
- 原開發部署分支 `deploy/cyweb-development` SHA `fe0f13db7c88b8c21374e3307bd4f70b21eb7459`，與功能分支已分歧；建立雙 parent 合流部署提交 `19a44060436928f972d3ca58e746af406751033d`，使用通過驗證的功能樹，並由部署分支快轉更新來觸發既有開發部署工作流程。
- 開發部署 GitHub Actions run: https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40917566654 。請以該 run 的**最終結果及健康檢查**判定部署成功，不能只看推送成功。
- **PR #313 不合併**；無正式生產環境發行。

---
## 2026-10-30 部署前檢查

使用者已同意部署，但明確要求 **不合併 PR #313**。部署前 Runtime CI 曾失敗：新增 `stocktake_sync_ignored` 未進入資料表驗證與可攜備份覆蓋清單。已補：
- `scripts/validate_schema.py`：`8bf30c5e`，補入 EXPECTED_TABLES。
- `worker/backup/schema-columns.ts`：`11ddcc26`，將新表三欄納入可攜備份。

需檢查最新版 CI，再依既有環境部署流程執行；PR 保持 Draft，不合併 main。

---
## 2026-10-29 架構修正（依使用者最新最終定義）

**最終需求：忽略清單僅告訴 QUERY 哪些 ERP 底稿不要掃；只有 QUERY 真正同步成功才有 WEB 盤點單。QUERY Windows 程式碼不修改。**

變更：
- `migrations/0031_stocktake_ignore_exclusions.sql`：新增獨立 `stocktake_sync_ignored(sheet_no,created_at,updated_at)`；將舊 `IGNORED` 記錄移至此清單。尚未 ERP 同步的 legacy stub 刪除；已同步的舊底稿保留資料，轉回 COUNTING（歷史資料保護待 Claude 審查）。
- `worker/http/store-stocktake-routes.ts`：管理員 `GET ?ignored=true` 查獨立清單、`POST /ignore` 加入編號、`DELETE /ignore` 移除編號；不再寫入 `stocktake_sheets`，也移除 `/:sheetNo/ignore` 和 `/unignore` 的盤點狀態操作。 `POST /sync` 讀此排除清單形成既有 `skipSheets`，不改 QUERY 協定。
- `worker/http/stocktake-erp.ts`：同步結果存入 D1 前再次檢查忽略清單，以防 ERP job 排隊期間新增忽略卻仍匯入。這是 WEB 同步接收端防護，**沒有修改桌面 QUERY**。
- `src/runtime/modules/StoreStocktake.tsx`：管理表只存底稿編號與加入時間；「移除」呼叫 `DELETE /ignore`；從盤點卡移除「設為忽略／取消忽略」狀態動作；前一輪已更名「同步ERP盤點單」及移除「更新畫面」。
- `scripts/store-stocktake.test.mjs`：調整新增/移除忽略 API 測試、確認未成功同步的底稿不會出現在 WEB。

主要提交：`adafdf12`、`6c7c7c88`、`f5df389c`、`b7ec0a29`、`8c25610f`、`df8a270a`。

**注意：先前 Handoff 對 `unignore`、以盤點狀態表示忽略、`?ignored=true` 回傳 StocktakeSheet 的敘述已過時，以本節為準。** Claude 必須檢查 migration 對已有歷史的 IGNORED 盤點單處理、同步佇列競態與最新版 CI。未合併、未部署。

---
## 2026-10-29 使用者釐清需求：忽略清單純粹是 ERP SYNC 排除表

- 更新盤點單改名為 **同步ERP盤點單**；移除「更新畫面」，因已有 30 秒清單自動輪詢及其他即時刷新。
- 忽略底稿**不是另一種需要在 WEB 操作的盤點單**，目的僅是排除 ERP 尚存但不需匯入的底稿編號。
- 新增忽略編號後 `STOCKTAKE_SYNC` 的 `skipSheets` 必須包含它；從排除表移除後，下次同步若 ERP 確實存在，才能產生 WEB 盤點單。
- 既有 schema 把同步前的排除編號記為 `stocktake_sheets.status=IGNORED` stub。為維持相容而不另加 migration；移除 **尚未讀明細** 的忽略 stub 時，API 刪除該 stub，不再轉成 `COUNTING` 造成 WEB 平白出現底稿；曾有明細的已忽略底稿則保留既有恢復行為，以免破壞歷史資料。
- UI 表格動作改稱「移除」，確認對話框清楚解釋是排除清單調整，不會建立 WEB 底稿。

本輪提交：
- `a940ba32`：同步ERP盤點單按鈕文案與刪除更新畫面。
- `15b6cfa4`：排除清單的 UI 文案和操作提示。
- `3e64bd70`：修正 `worker/http/store-stocktake-routes.ts` 的未同步忽略 stub 移除行為。
- `ce5ff95b`：`scripts/store-stocktake.test.mjs` 增加移除排除項後 WEB 不產生底稿的回歸斷言。

驗證要求：同一張 stub 加入忽略→SYNC skip→移除忽略→WEB 清單仍無該單→再次 SYNC 包含該底稿→ERP 回傳後才出現在 WEB。最新 Runtime CI 需對 **最終 SHA** 驗證，不得沿用先前成功紀錄。

---
# CYWEB 庫存盤點 UI 修改 — Claude 審查交接
日期：2026-10-29
Repository: `simonliu1118-byte/chihyuan-web`
Branch: `ui/store-stocktake-layout-20261029`
Scope: 僅 CYWEB 前端盤點頁面；不更動 Worker、DB、ERP Driver，不部署。

## 使用者需求
1. 上方查詢完成訊息不再佔據一整張卡，改用既有通知元件。
2. 更新盤點單／更新畫面／忽略底稿管理移入左側「盤點單」卡頂部，使左右欄從同一高度開始。
3. 新增忽略底稿的對話框中直接顯示已忽略底稿表格及逐筆取消忽略；移除「顯示忽略」。
4. 所有修改寫入 Handoff，最後交 Claude 審查。

## 按鈕語義確認（已閱讀 Worker）
- **更新盤點單**：POST `/api/business/store/stocktake/sync`，建立 `STOCKTAKE_SYNC` ERP job；skip 已忽略及已讀明細底稿；非強制重讀所有底稿。
- **更新畫面**：GET 同一路徑及畫面資料刷新，**不呼叫 ERP**；原本清單即有每 30 秒輪詢，選中底稿每 10 秒輪詢。
- **取消忽略**：呼叫現有 POST `/:sheetNo/unignore`，用 `expectedVersion` 做樂觀鎖；狀態從 IGNORED 恢復 COUNTING，並**不刪除**資料。按鈕文案使用「取消忽略」避免誤解。
- **已忽略底稿**：管理員專用 GET `?ignored=true`。

## 已實作修改
### Commit `7852ba46` — `src/runtime/modules/StoreStocktake.tsx`
- 將整排 `cy-store-toolbar` 按鈕移入 `cy-stocktake-sheets`，新增 `cy-stocktake-list-actions`，讓雙欄上移。
- 移除 `showIgnored` checkbox 和「顯示忽略」在清單、手機 select 的合併邏輯；忽略底稿在管理視窗處理。
- 管理員一律讀取忽略清單（不須啟用 checkbox）。
- 將已完成的查詢狀態改為共用 `useFeedback` 通知；排隊和執行中仍保留 `ErpJobStatus`，讓使用者看到查詢進度。
- 忽略底稿 Dialog 增加共用 `DataView` 表格＋手機卡片，欄位：底稿編號、底稿日期、單項「取消忽略」；刪除前用共用 `useConfirmation` 二次確認。
- 使用既有 `unignore` API；成功後重新讀取清單；失敗交由既有 `reportError` 顯示。
- 按鈕 `更新畫面` 保留，因為手動即時刷新有實質用途。

### Commit `ba45564f` — `src/runtime/modules/store.css`
- 新增盤點專用的集中式 selector，控制導覽卡頂部按鈕列與忽略清單間距，不散落於其他樣式檔。

### Commit `f284fef4` — 補齊成功提示與查無新單通知
- 原有 `setMessage` 的成功提示因移除全寬 FeedbackBanner 不可消失；改由共用 `useFeedback` 顯示，保留所有成功訊息。
- ERP `NOT_FOUND` 狀態顯示「沒有新盤點單」，避免向使用者只顯示狀態代碼。

### Commit `98803483` — 保留原按鈕文案
- 左側仍稱「新增忽略底稿」以符合使用者原操作習慣，開啟後是兼具新增、清單、單項取消忽略的「忽略底稿管理」Dialog。

## 風險／審查重點
- `useFeedback` 目前是共用 Dialog 提醒（非自動消失 Toast）。需求文字「通知」可能指共享通知體系，請 Claude 評估是否要採用 `ToastRegion`，不要私造通知元件。
- 目前沒有瀏覽器視覺驗證；檢查窄版手機下 `DataView` 卡片切換及對話框高度/捲動。
- `ignoreForm` 新增後會維持原本成功即關閉 Dialog 的行為；再次開啟可看到清單。
- 管理員開啟盤點頁時多一個 `?ignored=true` GET，應注意失敗時的反應（目前與正常清單同時取得）。
- 原已存在的「設為忽略」和選中已忽略底稿上的「取消忽略」操作仍保留 API 路徑，但清單不再顯示已忽略底稿。
- 提交 `42019a23` 對應 Governance Check 已通過，Runtime Check 曾處於執行中；新增修正提交 `f284fef4` 必須另取最新版 CI 證據。請在審查前要求最新 CI 證據；不得聲稱已驗證或直接合併部署。

## 後續驗收
1. Desktop：頁面沒有全寬操作列、同步進度只在執行時出現、左右卡對齊。
2. 按更新盤點單：ERP job 仍建立且完成時有共用通知；更新畫面不送 ERP job。
3. 管理員新建忽略底稿：成功；重新打開 Dialog 可見表格。
4. 逐筆取消忽略：有確認、回復初盤中、清單同步更新；測試 409 version conflict。
5. 非管理員不可看見忽略管理按鈕或取得清單。
6. 手機版：按鈕換行合理，忽略項目卡片可操作。
7. TypeScript build、單元測試及 CI 全綠。
