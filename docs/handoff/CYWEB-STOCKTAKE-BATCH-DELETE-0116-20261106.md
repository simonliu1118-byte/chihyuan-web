# CY Web V0.11.6：門市庫存盤點批號刪除圖示

- 日期：2026-11-06；執行：GPT。基準 `main@5982b09ee0de2d9c06e47e3c7a47e4f72b4c1a06`（V0.11.5）。
- 工作分支：`cyweb/stocktake-batch-delete-icon-0116`；獨立於 BOT 管理中心 PR #438（V0.12.0）。
- 依 `PROJECT_RULES.md` §9.1：本檔記錄所有修改與驗證，Claude 最終審查**尚待進行**，不可由執行者代填通過；本次無合併／部署授權。

## 使用者畫面需求與處理

使用者附上門市庫存盤點批號明細截圖，顯示操作欄內「刪除批號」文字按鈕因狹窄而折行。採用使用者建議的精簡做法：**移動到「批號」格內，改成共用垃圾桶圖示按鈕**。

- 桌機「批號」欄顯示批號文字與單一紅色危險動作垃圾桶圖示，強制同一行，批號過長會截斷但刪除圖示始終可見；右側「操作」欄不再放刪除文字按鈕。
- 手機盤點卡同樣將刪除圖示移至批號旁；下方展開區標題改「修改紀錄」，不再重複放批號刪除。
- 直接使用既有共用 `IconButton`、`Icons.remove`、`tone="danger"`、`variant="table"`；無障礙標籤及 hover title 帶完整批號。
- 顯示條件仍是 `r.line.isAdded && editable && !r.line.locked`；點擊仍呼叫既有 `onDeleteBatch(r.line)`，保留原先多儲位／已有數量時的確認、版本驗證與歷程。沒有修改庫存盤點資料 API 或權限。

## 修改檔案與測試

- `src/runtime/modules/StocktakeGroupedDetail.tsx`：共用新增批號刪除 IconButton，移出 actions，桌機與手機改放批號旁。
- `src/runtime/modules/store.css`：批號及刪除圖示不折行，過長批號截斷，圖示不縮小。
- `scripts/store-stocktake-ui.test.mjs`：驗證 IconButton、權限條件、桌機／手機位置、操作欄不再保留舊文字按鈕，以及 CSS 的同列規則。
- `docs/architecture/STORE_STOCKTAKE.md`、`VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、`docs/handoff/README.md`：同步行為、版本與交接。

## 風險、驗證及下一步

- UI-only：無 DB schema、migration、backup、ERP Agent、Worker API 或新的授權邏輯。
- 實際桌面／手機視覺位置、極長批號省略及觸控區域仍需實機目視驗收。
- PR #440 初次提交 `cc9fbcf1808534a575a2d1694680d55e7fbc7685` 的 CI：
  - [Runtime Check #42187295363](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42187295363) **success**：前端／Worker TypeScript、來源契約、Local D1 runtime acceptance、**656/656 Node 測試**與 Vite build 全部通過。
  - [Governance Check #42187295268](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42187295268) **success**。
  - [部署契約 #42187295305](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42187295305) **success**；PR 的 `deploy-development` 與正式稽核工作被跳過，**並非正式部署**。
- Claude 最終審查：**待審查**（審查者補日期／通過或需修正／意見）。
- **未合併、未部署**；正式站仍以最後一次成功的受控部署紀錄為準。


## 返修：複盤漏顯示 ERP 帳面數量（2026-11-06）

- 使用者回報並提供畫面：初盤確認後，盤點單狀態已進入「複盤中」，但表格只有「複盤數量」欄，沒有 ERP 帳面數量供對照。
- 原因：Worker `worker/http/store-stocktake-routes.ts` 的 `toLine` 在 `COUNTING`／`IGNORED` 隱藏帳面量、初盤確認後已回傳 `bookQty`；但是 `StocktakeGroupedDetail.tsx` 沒有將這個欄位渲染到 UI。**不是 ERP 或 D1 資料遺失**。
- `src/runtime/modules/StocktakeGroupedDetail.tsx`：解除盲盤後在桌機表格「複盤數量」左側新增「ERP 帳面數量」，手機在批號下方顯示「ERP 帳面數量（批號合計）」，缺值用「—」、零仍為 0；初盤仍不顯示帳面量，且後端盲盤保護不變。
- `src/runtime/modules/store.css`：重新分配複盤十欄寬度，狹窄桌機可橫向捲動；將上輪批號／刪除圖示共用同列樣式由桌機專用 media query 移至全裝置，避免手機圖示錯位；加上手機帳面字體樣式。
- `scripts/store-stocktake-ui.test.mjs`：新增解盲顯示條件、桌機／手機呈現、欄寬與 CSS 規則測試。既有 `scripts/store-stocktake.test.mjs` 已涵蓋「初盤不回傳 `bookQty`、第一次確認後回傳」的後端資料契約。
- `docs/architecture/STORE_STOCKTAKE.md`、`CHANGELOG.md`、`TODO.md`、本 handoff：同步既定 UI 行為及差異。
- 風險：`bookQty` 是 ERP **原始批號合計**，不是單一儲位帳面；若同批號有多個儲位，會在各儲位畫面重複顯示作為參照，但不參與加總。仍需桌機／手機實際畫面驗收。
- 此輪程式提交 `c696716785749d856020ad3c3b278ef001b56e81`，PR #440 最新 CI 結果：**待核對**。Claude 最終審查：**待審查**。未合併、未部署、未操作正式 D1。


## 返修 CI 第一輪失敗與調整

- 返修 head `e68117aa69dd83f403de94ef3ed1fe17014a9942`：[Runtime #42189056008](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189056008) 的前端／Worker TypeScript、來源契約與 Local D1 驗收均成功；Full Node test suite 僅有 `scripts/store-stocktake-ui.test.mjs` 中既有「stocktake grouped inventory uses location cells for save, history and desktop ordering styles」的來源字串斷言失敗。舊斷言寫死 `className="cy-ordering-grid cy-stocktake-grouped-table cy-stocktake-list-table"`，而因複盤動態追加 `cy-stocktake-show-book` 類別，原 JSX 表達式改為條件式組合。這是**測試對固定語法的耦合**，不是資料操作／Worker 測試失敗。
- 修正測試改檢查既有三個表格類別 token 仍存在；新增測試繼續檢查 `showBookQty` 解盲條件、桌機／手機 ERP 帳面呈現以及寬度。未更動程式行為。
- 重新執行 CI 的結果須以最新分支 head 為準；Claude 最終審查及正式合併部署仍待辦。


## 返修最新 CI 通過證據

- 程式與測試修正後 head `dd37e6944c7c446a3119ba61a0da400fe7cd6d81`：[Runtime Check #42189371683](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189371683) **success**：browser-typecheck、worker-typecheck、source-contracts、Local D1 runtime acceptance、**657/657 Node 測試**、Vite build 均成功。
- [Governance Check #42189371689](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189371689) **success**。
- [Deployment Contract #42189371753](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189371753) **success**，PR 驗證中正式 `deploy-development` 與稽核工作 skipped；**沒有正式部署**。
- 先前失敗是來源檢查寫死舊 `className` 字串，修正測試後全數通過。後端解盲原本即正常，沒有變動 ERP 資料／D1 schema／權限。
- **Claude 最終審查與桌機／手機視覺驗收尚待完成**。依使用者這次的 UI 修正指示，只更新原 PR #440，不合併、不部署、不碰正式 D1。

## 2026-11-07 使用者授權合併與共同發布

- 使用者明確授權修好 #438 後將兩張 PR 合併部署；本節取代上方先前輪次的「不合併／不部署」狀態。
- #440 最新 head `69bb2a9fb30db1a6b229c9bd4cf1fa53d200ba47` 的 Runtime [#42189825617](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189825617)、Governance [#42189825429](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189825429)、Deployment Contract [#42189825405](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42189825405) 均 success；隔離快照本機 `store-stocktake-ui.test.mjs`／`store-stocktake.test.mjs` **36/36 通過**。
- #440 已合併 main：`197f0a6704cf7002af243b338cd2f0b009278a69`。先合 V0.11.6，再由 #438 整合為 V0.12.0 Build 1，共同發布，避免版本倒退。
- 完整合併後 CI／正式部署／健康回讀證據將補在本節與 [BOT handoff](CYWEB-BOT-CENTER-0120-20261106.md)。此時尚未宣稱正式發布成功。
- Claude 未登入，事後複審與桌機／手機視覺驗收仍待辦；沒有代填 Claude 通過。
