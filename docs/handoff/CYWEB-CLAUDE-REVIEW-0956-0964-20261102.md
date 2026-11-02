# Claude 事後審查：V0.9.56 Build 1 至 V0.9.64（PR #319–#346）

- 日期：2026-11-02；審查基準 main `4f34b08`（正式站 V0.9.64，`06ea336`）。
- 範圍：盤點 Build 1–4（#319–#322）、門市顧客訂購流程 V0.9.57 Build 1–4（#324、#326–#329）、月度待辦 V0.9.58（#330–#331）、門市 V0.9.59–V0.9.64（#332–#346），以及各版 handoff。
- 結論：**通過，無阻擋問題**。共用元件問題由 Claude 在 V0.9.65 直接修正。各 handoff 中「Claude 最終複審待填」以本文件為準。

## 驗證

- `npm run typecheck`、`node --test scripts/*.test.mjs`（559 pass／0 fail）、`validate:source`、`validate_schema.py`（42 支 migration、111 張表）、`validate:d1:local`（含可攜備份與隔離還原驗收）、`npm run build` 全部通過。
- 正式站健康檢查為 V0.9.64，migration 0033–0041 已全部套用。

## Migration 0033–0041

- 重建表（0033、0037、0041）：先複製子表再換父表，不關閉外鍵，`SELECT *` 的欄位順序與前一版一致，訂單、品項、事件 ID 全保留。0037、0038–0041 有 5,000 列上限檢查，超過就中止。可以接受。
- 0035 把「到貨」併回「叫貨」並刪 `arrived_date`，依使用者決定；CHECK 仍允許 `ARRIVED`，無害。
- 0039 交換 `mobile`／`phone` 語意（聯絡 1／聯絡 2），已記錄在資料字典；之後讀程式時請以資料字典為準。
- 新表（`store_order_events`、`store_blacklist_events`、`store_blacklist_operations`、`store_monthly_*`）都已登記可攜備份與 schema 驗證。

## 後端

- 權限：門市路由走 `STORE_CUSTOMER_ORDERS`，月度待辦走 `STORE_MONTHLY_TODOS`；設定類操作在讀 body 前檢查 ADMIN 以上。操作識別（requestKey）防重送，版本守門防並發覆蓋。
- 黑名單比對：每次新增或取消訂單會讀整張黑名單（上限 1,000 筆），並以整表 `(id,version)` 快照守門。正確，但成本與黑名單筆數成正比。目前資料量很小，可接受；黑名單超過數百筆時，再改用聯絡方式索引查詢。
- 訂購清單搜尋用 `LIKE` 掃全部訂單與品項（上限 500 筆結果），只在開頁或搜尋時讀。目前可接受。
- 月度待辦每次請求會先跑 `ensureMonthlyRows`（讀設定 1 列，已產生就不寫）；另新增每日 Cron `0 16 * * *`。Cron 數量目前 3 個（加備份排程為 4 個）。

## 前端與共用元件（Claude 已修正，V0.9.65）

- GPT 新建的共用元件 `DateInput`、`PhoneInput`、`EntryTable` 放在 `src/ui/forms`，用法正確，保留。
- **重複元件**：`StoreCustomerOrders` 自寫 `Icon`（含 SVG），`StoreMonthlyTodos` 自寫 `Glyph`／`icons`，盤點與品項列內嵌 SVG；「修改紀錄」圖示在兩個模組各寫一份，四個模組各有一套圖示按鈕 CSS（22／26／28px 不一致）。已改為共用 `Icons` 與 `IconButton variant="table"`，模組 CSS 刪除。
- 側欄圖示：叫貨、門市沒有自己的圖示，退回 CY 程式的四方格，三個重複；已補上，並把工作日誌改得不再與銷售工單相似。
- 給 GPT 的規則重申：圖示一律放 `src/ui/actions/icons.tsx`；列內圖示按鈕一律 `IconButton variant="table"`；不要在模組內寫 `<svg>` 或新的按鈕尺寸 CSS。新增側欄項目要在 `AppShell` 的 `navIconPaths` 加自己的圖示。

## 流程

- 這段期間多個版本含 migration（0033–0041），先合併部署、事後才交 Claude 審查。使用者已授權，但依 2026-10-30 的約定，**含 migration 或 API 的變更應先審後合併**，單純 UI 才先上線後審。
- 開著的 draft PR #323（設計文件）、#325（部署證據）內容已併入 main，可以關閉。
