# V0.9.63 補價輸入與十四天逾期交接

2026-11-02 Asia/Taipei。分支 `cyweb/store-overdue-14-days-0963`，base `86539bf`。使用者延續授權完成後合併部署；Claude最終複審待填、未代簽。首輪尚未發布，後續同分支追加實際發布證據。

## 修改檔案與定案

- `shared/store.ts`：STORE_PICKUP_OVERDUE_DAYS由7改14，通知日為day0、隔日day1；台北第14天結束後才逾期。例如11/1通知，11/2第1天、11/15第14天、11/16起逾期。既有daysSinceNotified按台北日曆計算不變，無日期通知使用實際確認通知日。
- `StoreCustomerOrders.tsx`：移除hardcoded >7，改引用唯一共用常數，清單Pill及篩選依同一orderState判定。僅NOTIFIED正常供貨適用，已取貨／顧客取消／供貨失敗維持原狀態邏輯。
- `store.css`：既有數字輸入去spinner規則由entry table範圍擴至CustomerOrders模組，讓清單補價popover也套用appearance:textfield與WebKit spin-button隱藏；原number/min0/max999999/step1及server驗證不改。沒有新增第二套CSS override。
- `scripts/store-page.test.mjs`：固定日期，11/15 23:59:59+08仍待取貨、跨零點11/16為逾期未取，測試實際頁面分類而非只檢查常數。
- VERSION／package0.9.63，Build0；架構／TODO／CHANGELOG同步。無Worker／API／schema／migration／資料回填改動。

## 驗證與成本

- npm run build與browser／Worker typecheck通過；store-page＋store-route **67/67**通過。完整LinuxCI待下方補。
- 真前端／Worker／SQLite合成瀏覽器：補登單價可輸入1900、appearance=textfield，仍type=number／min0／max999999；上下箭頭移除。外層outputs `store-0963-price-no-spinner.png`及局部周邊畫面`store-0963-price-detail.png`，不提交圖片或正式資料。驗收tab與本機服務已關閉，沒有更動使用者原tab／viewport。
- 沒有新增D1查詢／輪詢／寫入路徑或大量資料作業；只是既有清單資料的前端狀態分類及CSS。正式bulk讀寫0，部署健康檢查仍走原流程，不能把服務整體讀寫宣稱0。
- Owner維持CustomerOrders／shared常數與既有樣式，無新增state owner、observer、retry、wrapper或renderer。

## 待辦

必要CI／PR／合併部署與雙入口source／D1／HTTPS／排程證據追補；Claude事後複審及正式登入／實機驗收。保留功能分支。
