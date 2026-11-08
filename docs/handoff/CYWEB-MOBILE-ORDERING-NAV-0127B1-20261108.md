# CYWEB V0.12.7 Build 1 — 手機叫貨三頁籤與桌機相容性複審

2026-11-08 · GPT · 分支 `cyweb/mobile-ordering-navigation-0127b1-20261108`。
正式 main 起點 `4d59487c05d68e875e71532af0e61a1cc05efff1`（已上線 V0.12.7 Build 0）。
**使用者指示「可以，先改吧」是修改授權，沒有合併或部署授權。** 不得快轉發布分支、修改正式 D1 或藉本次 PR 合併首頁 #457。

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
- `BUILD=1`，版號繼續 `0.12.7`，更新 CHANGELOG、TODO、ORDERING_MODULE、UI_COMPONENT_CATALOG 及 handoff。

## 請 Claude 重點檢查

1. **桌機行為不變**：在 821px 以上左右雙欄同時顯示，原歷史清單及篩選器、未到貨表格、來源 tabs、廠商 tabs、原草稿 chips、進貨輔助及來源管理功能完整；沒有因 CSS wrapper 造成 filter/grid 移位。
2. **手機首屏**：先看到「叫貨清單」且不含草稿，且可直接打開已送出／部分到貨／已結案及作廢單；三頁籤順序與選取指示正確。
3. **手機未到貨**：點「未到貨」即呈現原 `pendingOrders`，不顯示任何多餘來源頁籤／廠商清單，保有分組收合、單筆與整單登記到貨、結掉；原收到貨 Dialog 含 ERP 進貨單號等限制不變。
4. **手機草稿**：公司內部來源及所有啟用廠商皆可搜尋與選取；「其他」及個人廠商排序沿用既有 orderedVendors；點來源使用原 `drafts/open`，已有多張草稿可切換、無草稿可新增，單據可儲存／送出。
5. **未儲存保護**：從草稿到清單、未到貨、返回及切來源，執行原 `prepareSwitch` 的 flush、確認、版本處理，失敗或取消不能靜默失去輸入。
6. **不改後端**：無 Worker／D1 migration／CYID／權限變動，無首頁 #457/#458 內容。注意原 `GET /orders?status=DRAFT` 在手機版已移除，避免每次切頁做額外 200 筆上限的草稿查詢。
7. **手機實機視覺**：iPhone Safari 375/390/414 px、深／淺、字級放大、手機橫向，確認導覽列不擠壓、搜尋與篩選可操作、單據卡片與到貨 Dialog 不水平外溢。
8. CI：source contracts、desktop Node ordering、mobile Node regression、browser/Worker TypeScript、Vite build、D1 本機與 Governance／PR release contract 等檢查。**Claude 複審、實機驗收未進行，不能用 CI pass 代替。**

## 執行紀錄與待辦

- 開發 PR：待建立、回填 CI。
- Claude 最終複審：待辦。
- 真實桌機、手機登入操作與視覺驗收：待辦。
- **使用者本輪未批准合併、部署**：保留此 PR 在獨立分支；main、deploy ref 及正式 D1 均不變。
