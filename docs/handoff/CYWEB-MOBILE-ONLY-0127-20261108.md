# CYWEB V0.12.7 Build 0 — 手機 UI 獨立發布（Claude 事後複審 handoff）

日期：2026-11-08，使用者明確授權 **僅先合併、部署手機版**，首頁 #457 與其 D1 0059 保持未合併、未部署。

## 獨立來源與隔離驗證

- Release 工作分支：`cyweb/mobile-only-release-0127-20261108`，**直接從正式 main `abb29221bb71f85305aad597ed10a2110d023c6d` 建立**，不是從 #457/#458 推進正式分支。
- 將 #458 中屬於手機 UI 的檔案移植；`src/App.tsx` 僅手動改 `<ThemeToggle iconOnly direct />`，`src/app.css` 僅移植四處手機式樣，不複製 #457 的整份程式或 CSS。其餘被移植的 UI/test 檔案在原 #458 父分支與 main 的 blob 完全相同，僅含 #458 的差異。兩張原始 Draft PR 不更動。
- 根版號獨立設 `VERSION=0.12.7`、`BUILD=0`。保留 main 全部已發布業務功能及原 D1 migration 上限 **0058**。
- 嚴禁加入：首頁 Hub／公告／個人通知／個人待辦／鈴鐺的 #457 程式、`docs/architecture/HOME_HUB.md`、`0059_home_hub.sql`、新權限或新 Worker routes。
- 本次沒有新增 API、Cloudflare 資源、CYID 合約、D1 表與遷移。依 `PROJECT_RULES.md` 的正式部署機制，在本 release PR CI 完整成功後才合併 main，取得合併 SHA 再以 `force=false` 快轉既有 `deploy/cyweb-development`。

## 使用者要求

根據 iPhone Safari 截圖：手機右上深淺切換不要醜的方框；模組側欄縮窄；ERP 查詢程式的已連線按鈕改小 pill；ERP 查詢類別改頁籤；叫貨手機能直接開草稿，頁面與輸入改成適合手機版。

## 程式及安全

- `src/ui/foundation/ThemeToggle.tsx`、`src/App.tsx`、`src/app.css`：手機無框日月 icon，按一下在有效的淺／深模式切換；桌機及登入頁的原設定不動。頂欄縮緊，保留既有功能。
- `src/ui/overlays/overlay.css`：只有模組側邊導覽由 320px 縮至 264px，其它彈窗不變。
- `src/runtime/modules/ErpAgentCredentialControl.tsx`、`src/runtime/modules/ErpItemQueryPage.tsx`、`src/runtime/modules/erp-item-query.css`：手機 ERP 狀態縮為帶色點 pill，點擊仍開原權限保護的管理 Dialog；查詢分類使用與桌機相同的可橫滑 tabs，保留同一 kept-mounted 查詢結果、佇列與查詢中提示。
- `src/runtime/modules/OrderingPage.tsx`、`src/ui/OrderingGrid.tsx`、`src/runtime/modules/erp-item-query.css`：手機因原 `MasterDetail` 初始為 list，該 list 用 `history=1` 排除草稿，導致草稿入口消失。新增手機「草稿／未到貨／叫貨紀錄」入口，預設草稿清單，使用原 `GET /orders?status=DRAFT`（僅可見時、無輪詢），可搜尋／直接打開草稿／新增來源。依原 `prepareSwitch`、`reloadOrder`、原驗證與 auto-save；叫貨單和未到貨列在手機以相同 DOM 的 data-label CSS 卡片呈現，不做第二 renderer。桌機 Grid 與門市不變。
- `scripts/ordering-page.test.mjs` 與 `scripts/mobile-shell-ordering.test.mjs`：舊測試 mock 共用 compact Hook，以及新手機需求測試。

## Claude / QA 必查

1. 375/390/414 px iPhone Safari 實際可點、主題切換不擠壓 CY／帳號、左右滑 ERP tabs 不受限、模組側欄可關閉與捲動。
2. 叫貨草稿一進頁可見，不會與「叫貨紀錄」混淆；不同來源與同來源多草稿都能進入、修改、重新整理、送出、刪除，不會卡在空白畫面。
3. 未儲存／版號衝突的切換（含回上一頁、手機三入口、廠商 tabs）正確依 `prepareSwitch` 處理，不遺失資料。驗證原 Grid Enter、blur、auto-save 邊界。
4. 手機卡片不會破壞桌機 Grid／門市表格、ERP 背景查詢/排程。既有草稿 API 的 200 筆上限沒有變更，超量仍會回 409。
5. 確認本次 PR 完全不含 #457 的首頁 Hub、公告、通知、待辦、鈴鐺與 D1 0059；原 #457/#458 保留 Draft，未偷合併。
6. 完整 Runtime CI、Governance、PR 部署契約（如適用），正式發布 workflow／health／source 一致性。**CI 不能當成 Claude 已複審，也不代表真人實機驗收完成**。

## 執行驗證證據

- PR、合併 SHA、實際發布 Run/health 回讀，依實際結果補記。Claude 事後複審與 iPhone 實機 UX 驗收仍待辦。
