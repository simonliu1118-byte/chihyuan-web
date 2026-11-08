# CYWEB V0.12.7 Build 1 — 手機叫貨三頁籤與桌機相容性複審

2026-11-08 · GPT · 分支 `cyweb/mobile-ordering-navigation-0127b1-20261108`。
正式 main 起點 `4d59487c05d68e875e71532af0e61a1cc05efff1`（已上線 V0.12.7 Build 0）。
**授權更新**：使用者先授權修改手機叫貨導覽，之後明確指示「手機版的匯出 excel 行為改用瀏覽器原生那個分享，可以合併部署」。因此本 PR #460 **已獲合併、部署手機版授權**，但仍須先通過新版完整 CI／發布契約，並保留 #457／#458 首頁功能未合併、D1 0059 不部署。

## 使用者確認的桌機流程

- **叫貨清單**：電腦版本就不包含草稿；`history=1` 由 Worker SQL `o.status<>'DRAFT'` 排除草稿，包含已送出、部分到貨、結案、作廢。仍支援未結案切換、品項搜尋、狀態、來源、起迄日。
- **未到貨**：`GET /pending` 直接提供所有待到貨品項。桌機在右側顯示原單一明細區，依叫貨單分組並可收合、登記到貨、結掉；不需要先進來源清單。
- **草稿**：桌機右側來源／廠商 tabs 為原入口；選擇來源後原 `GET /drafts/open?sourceId=` 開啟既有草稿，若無草稿可建立，並能在同來源多張草稿間切換。桌機是左清單＋右明細雙欄。
- 這輪只整理手機導航，**不重寫桌機既有操作或共用後端契約**。

## 本輪實作

- `src/runtime/modules/OrderingPage.tsx`：手機三頁籤依序 **叫貨清單／未到貨／草稿**，預設 `mobileListMode=history`。手機清單仍使用原 `history=1`、`StatusFilter`、`OpenOnlyToggle`、`OrderingSourcePicker`、`DateInput`，只讓進階篩選收合。未到貨直接進既有 `viewPending` 與 `pendingOrders(pending)`，**手機不渲染第二層來源／廠商 tabbar**，亦不出現多餘的「返回草稿／紀錄」；桌機原 tabbar 及返回文字保留。
- **草稿來源列表**：原先手機預設直接查 `GET /orders?status=DRAFT`，現已移除該額外查詢／refresh state，改以既有 `sources` 與 `orderedVendors` 呈現公司來源／廠商兩組，可搜尋並點入 `selectSource`、`chooseVendor`；真正草稿仍由同一 `openDraft`、`OrderingGrid` 與草稿 chips 管理。沒有新增持久狀態或另一套資料操作者。廠商狀態點沿用 `VendorDots`。
- `src/runtime/modules/erp-item-query.css`：把手機三頁籤、來源列表、進階篩選與編輯卡片限定 `@media(max-width:820px)`。共用 `cy-ordering-history-advanced` desktop `display:contents` 保持原子控制項位置；手機才有收合與 `[hidden]`，手機的冗餘廠商橫向 tabs 隱藏。來源管理與有權使用的進貨輔助保留在手機「草稿」來源區，桌機同位置原樣保留。
- `scripts/mobile-shell-ordering.test.mjs` 更新為新流程的靜態契約檢查，保留 ERP、外觀、Drawer 和 Grid 的既有測試；另須確認桌機原 `scripts/ordering-page.test.mjs` 完整通過。
- **手機原生 Excel 分享（本輪追加）**：`src/runtime/modules/OrderingPage.tsx` 在 `compact` 下顯示「分享 Excel」，同一次點擊同步生成 `File` 並呼叫 `shareExcelFile`，無未儲存修改時不用等待任何 `await`；草稿若仍在自動儲存、修改已送出單時，由專用 `saveForExcelShare` 背景完成儲存，不走 `prepareSwitch` 的放棄修改流程；若儲存失敗，留在頁面並顯示錯誤，**不分享舊 Excel**。同一次點擊儲存成功後立即嘗試原生分享，若 Safari 因非同步儲存失去分享授權則自動下載最新 Excel 備援，按鈕永遠維持「分享 Excel」。瀏覽器不支援檔案分享時下載同一 XLSX，取消分享不下載。手機備援 Object URL 延遲清理；**桌機保留原有 Blob/anchor 即時下載程式**，無新增業務 API。
- `src/runtime/modules/ordering-file-share.ts`：集中 Web Share files 能力檢查、取消／失敗備援；`scripts/ordering-file-share.test.mjs`：6 項合成測試覆蓋同次點擊分享、取消、無支援能力、capability 例外、分享權限錯誤與桌機下載原樣，以及單鍵背景儲存後分享的程式契約；完整 Node suite 待 CI 檢查。
- `BUILD=1`，版號繼續 `0.12.7`，更新 CHANGELOG、TODO、ORDERING_MODULE、UI_COMPONENT_CATALOG 及 handoff。

## 請 Claude 重點檢查

1. **桌機行為不變**：在 821px 以上左右雙欄同時顯示，原歷史清單及篩選器、未到貨表格、來源 tabs、廠商 tabs、原草稿 chips、進貨輔助及來源管理功能完整；沒有因 CSS wrapper 造成 filter/grid 移位。
2. **手機首屏**：先看到「叫貨清單」且不含草稿，且可直接打開已送出／部分到貨／已結案及作廢單；三頁籤順序與選取指示正確。
3. **手機未到貨**：點「未到貨」即呈現原 `pendingOrders`，不顯示任何多餘來源頁籤／廠商清單，保有分組收合、單筆與整單登記到貨、結掉；原收到貨 Dialog 含 ERP 進貨單號等限制不變。
4. **手機草稿**：公司內部來源及所有啟用廠商皆可搜尋與選取；「其他」及個人廠商排序沿用既有 orderedVendors；點來源使用原 `drafts/open`，已有多張草稿可切換、無草稿可新增，單據可儲存／送出。
5. **未儲存保護**：從草稿到清單、未到貨、返回及切來源，執行原 `prepareSwitch` 的 flush、確認、版本處理，失敗或取消不能靜默失去輸入。
6. **不改後端**：無 Worker／D1 migration／CYID／權限變動，無首頁 #457/#458 內容。注意原 `GET /orders?status=DRAFT` 在手機版已移除，避免每次切頁做額外 200 筆上限的草稿查詢。
7. **手機實機視覺**：iPhone Safari 375/390/414 px、深／淺、字級放大、手機橫向，確認導覽列不擠壓、搜尋與篩選可操作、單據卡片與到貨 Dialog 不水平外溢。
8. 手機 iOS Safari 另須實機確認：按鈕始終顯示「分享 Excel」；已儲存單按一次原生分享，草稿待儲存時同一次操作自動完成儲存再嘗試分享（若失去分享授權則備援下載最新 XLSX，不固定要求第二次點擊）；AirDrop／LINE／儲存到檔案傳送的是 `.xlsx` 附件；取消分享不觸發下載；舊 Safari 不支援 files 時下載備援。桌機匯出仍直接下載，不出現 Share 面板。
9. CI：source contracts、desktop Node ordering、mobile Node regression、新增原生分享測試、browser/Worker TypeScript、Vite build、D1 本機與 Governance／PR release contract 等檢查。**Claude 複審、實機驗收未進行，不能用 CI pass 代替。**

## 執行紀錄與待辦

- 開發 PR：待建立、回填 CI。
- Claude 最終複審：待辦。
- 真實桌機、手機登入操作與視覺驗收：待辦。
- **使用者已批准合併、部署此手機 PR**：必須以最新 CI 成功為閘門，合併 main 後驗證來源完整 SHA，以 `force=false` 快轉原 `deploy/cyweb-development` 觸發正式部署；部署後檢查 canonical、workers.dev 的 `/api/health`、D1 不套用 0059。**首頁 #457、#458 仍禁止合併部署**。
