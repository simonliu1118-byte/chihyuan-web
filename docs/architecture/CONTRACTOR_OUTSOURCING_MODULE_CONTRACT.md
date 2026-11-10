# 委外／代工模組契約 — WO-0.18.0

> 本版屬 **V0.18.0 開發中的新流程規格**；實作尚待 CI、畫面、資料驗收及 Claude 最終審查。未合併、未部署前，正式站仍以 V0.17.3 既有流程為準。
> 對外業務語意依工作單 [WO-0.18.0](../development/work-orders/WO-0.18.0.md) §2，既有 BD-026、027、032、036、038、040 與本次使用者確認事項共同決定；新規格取代舊單次入庫、計價、付款綁在工單狀態的設計。

## 1. 權限與 authority

- 所有代工主檔、BOM、代工單、庫存、對帳付款均經 `OUTSOURCING` 模組權限的 protected Worker API → D1；所有寫入寫共用 Audit，包含取消、重啟及付款刪除。
- 瀏覽器僅負責資料呈現及操作草稿，D1 ledger／單據／調整／對帳等 business mutation 均由 Worker service 擁有；瀏覽器不得以自身暫存取代 D1。
- 每次修改／撤銷／付款必須帶 `expectedRevision`，由後端驗證最新狀態；不可因裝置差異改變權限或資料語意。
- ERP 連動暫不實作，ERP 單號為手動輸入參考，不會自動在 ERP 出庫、入庫、改庫存。

## 2. 協力廠商、單價與 BOM

- `contractors` 支援個人與公司，聯絡人與既有資料保留。
- 廠商 `billing_method`：`single`（單次，預設）或 `monthly`（月結）；它只決定建立對帳單的預設選取方式，不阻止另一種方式。
- 現行 `contractor_pricing`：一個廠商＋成品只有一個當前價，含計價單位、每單位單價及 revision。交貨時取當下快照，後續改廠商價不可回寫已交貨單價。
- 每成品可有多個有效 BOM variant；建立工單時的 BOM 下拉僅列該成品 BOM，僅一筆時預選，允許留空。
- BOM 使用成品 output quantity/unit 和 component quantity/unit 及商品 unit-conversion，全部採 scaled4 exact 運算。交貨指定 BOM 時扣料；不指定則不扣料。

## 3. 代工單：成品、發料、交貨

一張 `outsourcing_orders` 有多筆 `outsourcing_order_products`，每筆記成品、BOM、預計數量、單位、排序。

- 狀態由 service 根據資料即時得出，**只有四種**：
  - `pending_issue` 待發料：未有有效發料。
  - `in_production` 生產中：已有有效發料且尚有成品未交齊。
  - `delivered` 已交齊：有有效發料、所有成品實交量均 ≥ 預計。
  - `closed` 已結案：手動填原因；重新開啟後恢復依資料計算的狀態。
- `outsourcing_issues`＋`outsourcing_issue_items`：每批可有不同日期、多料件，確認後在 ledger 記 `issue` 正數；預設建議數量是工單全部未交成品 BOM 所需量合計減該廠商現有料件量，小於零取零，使用者仍可調整及新增其他料件。
- `outsourcing_receipts`＋`outsourcing_receipt_items`：每批有日期、ERP 單號、備註、多種成品、BOM、數量、單位及單價快照。多批累積達預計量就視為已交齊，可超交；表格進度條上限 100%。交貨視窗顯示本批 BOM 消耗預告。
- 取消發料：批次記 `cancelled_at`，在 ledger 對原 issue 建反向 `reversal`；可能產生負庫存（允許，不擋單）。
- 取消交貨：批次記 `cancelled_at`，ledger 對原 BOM consumption 建反向 `reversal`；**已被 confirmed statement 引用的交貨不可取消**。原本尚在草稿對帳單的明細取消後解除歸屬。
- 單據已存在發料或交貨（含取消者）時不得硬刪；只有完全沒有操作歷史的草稿可硬刪。

## 4. 廠商庫存 ledger 與電池條

`contractor_stock_movements` 是單一 authority；以 `contractor_id + item_id` 的所有 delta 合計成現有量，異動種類 `issue/consumption/return/adjust/reversal`，來源指向原發料、交貨或庫存事件。

- 退料 `return`：廠商退回公司，減少廠商持有量。
- 盤點 `adjust`：輸入實際量或增減量，原因必選損耗、盤點差異、其他（其他須填補充說明）。
- 退料與盤點只適用該廠商**曾有發料**的料件。退料、盤點、消耗、取消交貨均不重設電池條基準。
- 基準量 = 這個廠商＋料件「最新一次**有效發料後**」的現有量，若最新發料取消，回復到前一次有效發料後；不另存可修改的 baseline。
- 百分比 `round(current/baseline × 100)`，最多 100%；>= 50% 綠，20%～49% 黃，<20% 紅；現有為負時整條紅、百分比顯示「—」，數量紅字粗體。
- 定案案例：發 100→100%、耗到10→10%、再發100→110／110=100%、耗到5→5／110≈5%、再發100→105／105=100%。
- 庫存頁按廠商可收合，依該廠商尚未結案代工單成品 BOM 分組；其他材料列「其他料件」。對每成品，**約能做 N** 為所有 BOM 料件能支持的整數件數之最小值；任一必要料件 <= 0 顯示「料件不足，需補料」。
- 預設隱藏現有量為零的料件，可切換顯示全部；異動歷程應列出日期、廠商、料件、種類、delta、現有量、原因、來源、操作人。

## 5. 對帳單與付款

- 對帳單與代工單分離。對帳單屬單一廠商，可選月份自動列出當月所有未對帳的交貨明細，或逐批勾選；同一 `receipt_item_id` 不可被兩張對帳單重複引用。
- 對帳單 `draft` 可修改單價、其他費用與折讓（負數）；`confirmed` 必須全部有單價，確認後鎖定；沒有付款時可取消確認回草稿；草稿可刪。
- 明細金額：已按正式計價單位換算的數量 × 單價，四捨五入至兩位小數 money2；總計加上正負調整後四捨五入至整數元，不因小數拒絕計價。
- 付款記錄日期、方式（現金／匯款／支票／其他）、正金額、備註及操作者；可多次付款，未達應付為部分付款、付清為已付清；單筆可刪並留 Audit。工單本身不具有計價或付款狀態。
- 交貨表須顯示待對帳／草稿對帳中／已確認／已付清。

## 6. 共用 UI、備份與驗證

- 五頁籤：代工單｜對帳付款｜代工庫存｜協力廠商／單價｜BOM；手機採共用 `ModuleSections` 頂部分頁。
- 主單據的瀏覽與編輯用 `RecordSheet`＋`RecordRows`，新增批次／退料／盤點／對帳視窗用 `Dialog`＋`EntryTable`。表格格子本身是輸入區，不另設直排表單。BOM 顯示 `recipe_ref`，禁止顯示內部 ID。
- 金額、數量、日期、單位應沿用共用輸入元件；Enter 移到下一格、Ctrl／⌘＋Enter 儲存；日期四碼年份。
- `0062_outsourcing_flow.sql` 僅重建原本確認無代工單／BOM／單價資料的代工流程表，保留既有廠商、聯絡人、廠商價格與 BOM 主檔資料。
- 新 D1 tables 與欄位列入 `worker/backup/schema-columns.ts` 的可攜備份來源；歷史 schema 留在 Git migration chain，不在 active owner 另開一套。
- 實作驗收清單以 WO §6，工程進度看 TODO 與工作分支 handoff；此文件**不是新增第四層永久治理規則**。
