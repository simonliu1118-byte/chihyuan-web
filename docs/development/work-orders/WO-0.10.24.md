# WO-0.10.24 門市流程：下一步登記後上一步鎖定、送廠物流顯示

- 狀態：**待審查**（2026-11-04 Claude 開立，執行者：GPT）
- 分支：`cyweb/wo-0.10.24-step-lock`；版號：V0.10.24（若已被占用就用下一個空號，CHANGELOG 同步）
- 開工前必讀：`docs/architecture/UI_COMPONENT_CATALOG.md`、`docs/architecture/STORE_REPAIRS.md`、`docs/architecture/STORE_CUSTOMER_ORDERS.md`

## 1. 背景（使用者原話）

- 「送廠的時候要填物流，但填完之後就不會再看到，這個方塊應該要有物流吧?」
- 「新增完畢之後，檢測(可填寫補充說明) - 送廠(必須填寫物流)。登記送廠之後檢測的日期和補充說明就不能再更改，同理點了完修之後送廠相關的資料就不能再更改」
- 「門市訂購的一步一步應該也要這樣才合理? 下一步登記之後上一步照理就不能再更改」

## 2. 已定案規則

1. **售後維修流程**：檢測（結果必選，補充說明可空白）→ 送廠（貨運必填，寄送編號依現行規則）→ 完修 → 通知 → 歸還。
2. **鎖定**：某一步「之後的下一步」已登記，該步的日期與所有細節就**唯讀**。
   - 例：已登記送廠 → 檢測日期、檢測結果、補充說明都不能改。
   - 例：已登記完修 → 送廠日期、貨運、寄送編號都不能改。
   - 只有「目前最後一步」可以改日期與細節。
   - 改錯時，用現有的「退回上一步」處理；退回後原本那一步恢復可改。
3. **顯示物流**：點開送廠格的小視窗，要顯示已填的貨運與寄送編號；目前最後一步可以修改，被鎖定時只能看。歸還若選「寄送」，歸還格同理。
4. **顧客訂購**套用同一條鎖定規則：下一步已登記，上一步的日期唯讀。未接通、叫貨結果等現有特殊規則不要改，只加鎖定。
5. 取消、撤回結案、撤回取消等既有規則不要改。若和鎖定衝突，先停下來問 Claude 或使用者。

## 3. 實作要點

- **後端**
  - `worker/http/store-repair-routes.ts`：`PATCH /{id}/date` 加檢查。目標步驟之後的任何步驟已有日期或狀態已超過，就回 409「下一步已登記，不能修改」。`inspectResult`、`inspectProblem` 同樣限制。
  - 新增「改目前步驟物流」的能力：
    - 可以擴充 `PATCH /date`，讓它接受 SENT 的 `shipping`，以及 RETURNED 的 `returnMethod`／`shipping`。
    - 只允許該步驟仍是最後一步時修改。
    - 寫入事件與稽核，沿用現有的 `event()`、`audit()`。
  - `worker/http/store-routes.ts`：顧客訂購的 `更正日期` 加同樣的鎖定檢查。
- **前端**
  - `src/runtime/modules/StoreRepairs.tsx`：格內小視窗（`.cy-store-date-popover`）依鎖定狀態切換。
    - 可改：日期與細節欄位都可編輯。
    - 鎖定：欄位停用或改成純文字，只留「關閉」按鈕。
    - 送廠與歸還（寄送）要帶出既有的貨運、寄送編號（`StoreShippingFields`）。
  - `src/runtime/modules/StoreCustomerOrders.tsx`：已登記且不是最後一步的格子，點開只能看不能改，或依現行做法停用，但要能看到日期。
  - 共用元件照 `UI_COMPONENT_CATALOG.md`，不要另做新樣式。
- **測試**
  - `scripts/store-repairs.test.mjs`：新增「登記送廠後改檢測 → 409」「登記完修後改送廠物流 → 409」「最後一步可改物流」三種情況。
  - `scripts/store-page.test.mjs`（以及顧客訂購相關測試）：補上「下一步登記後更正上一步日期 → 409」。
- **文件**：`STORE_REPAIRS.md`、`STORE_CUSTOMER_ORDERS.md` 補鎖定規則；`CHANGELOG.md`；`TODO.md` 勾掉本項。

## 4. 驗收

- `npx tsc --noEmit -p .`、`npm run validate:source`、`node --test scripts/*.test.mjs`、`npm run validate:d1:local` 全部通過。
- 附截圖：送廠格小視窗顯示物流（可改／鎖定兩種）、檢測格鎖定、顧客訂購上一步鎖定。
- 開 PR 給 Claude 審查。**不要自行合併或部署。**


## 8. 完成報告（GPT，2026-11-04）

- V0.10.24 Build 0，基準 main 3a662d7f（V0.10.23），承接工單提交 d6e6b679；PR 待建立。
- 已完成：維修及訂購前一步鎖定（含無日期）、物流帶回與目前步驟更正、較早維修步驟只讀／關閉、物流事件與稽核、退回恢復修改；取消、未接通及五分鐘猶豫規則保留。
- 訂購退回會保留日期，因此依有效狀態判定鎖定，沒有刪除歷史日期。手機展開格佔整欄，修正日期按鈕 height:100% 撐高問題。
- 指定 tsc、typecheck、build、validate:source 通過；三支相關測試 79/79。完整測試 622 項中 611 通過、11 個失敗在 main 原版重現。
- 本機 D1 migrations、18 組 Worker／D1 及舊 session 表檢查均 PASS，但清理暫存檔遇 Windows WinError 32，指令非 exit 0；完整 Node 與 D1 命令待 Linux CI 核對。
- 實際元件合成畫面：送廠可改／鎖定、檢測鎖定、訂購上一步停用、歸還物流及手機版。沒有操作正式資料。
- [handoff](../../handoff/CYWEB-WO-0.10.24-STEP-LOCK-20261104.md) 列出逐檔影響、測試限制、六張截圖及雜湊；未合併、未部署。

## 9. 審查紀錄（Claude 填寫）

待 Claude 審查，GPT 未代填通過。
