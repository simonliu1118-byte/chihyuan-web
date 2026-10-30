# 門市顧客訂購 V0.9.57 契約

實作候選，尚待審查／部署。設計見 [方案](../handoff/CYWEB-STORE-ORDERS-WORKFLOW-DESIGN-20261031.md)，驗證與限制見 [交接](../handoff/CYWEB-STORE-ORDERS-IMPLEMENTATION-0957-20261031.md)。

- STORE_CUSTOMER_ORDERS gate；新單 REGISTERED（訂購），沿 REGISTERED → ORDERED → ARRIVED → NOTIFIED → PICKED_UP 前進。取消另為終止狀態；不可跳階。所有作業手動，沒有叫貨／ERP／通知／金流連動。
- 訂購、黑名單顧客姓名必填，電話／手機／LINE 至少一項。有填的號碼需合法。數字跨 phone/mobile 匹配，LINE 僅為非唯一名稱候選，由人員核對，不能自動合併。
- 每次有狀態／內容／日期的異動帶 expectedVersion 與 requestKey；進度日期必填、可更正不可清空。作業日與系統事件時間分離。退回保留上次作業日；曾叫貨後修改需理由，退回不能繞過。
- 結案不改訂購內容，但允許既有日期更正／誤按退回；取消不恢復。訂金不得超過合計，尾款為合計減訂金，非收款結果。
- 黑名單處置 REFUSE=拒絕訂購、FULL_PAYMENT=須全額預付、OTHER=其他（人工依理由處理）。取消顧客原因若既有黑名單追加原因事件；新對象是／否後依選擇原子提交。手動黑名單允許零訂購事件，不自動加重處置。移出保留事件。
- 0033 migration 不清資料，保留舊 ORDERED 語意與原聯絡／品項 ID；舊通知日可取台北日期，其餘未知日期不捏造。新增業務歷程、黑名單事件列入 portable backup，精確 pre-0033 備份可升級到空白新版 target。
- GET orders 主表上限 500、黑名單 1000；history 20 筆游標分頁。黑名單並發以版本 snapshot 原子 guard 防止與取消／訂購異動競爭。
