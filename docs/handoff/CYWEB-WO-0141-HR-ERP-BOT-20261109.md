# CYWEB WO-0.14.1 — 批次 5 人事、ERP 查詢、BOT
2026-11-09，分支 `cyweb/wo-0.14.1-hr-erp-bot`，父分支 `cyweb/wo-0.14.1-early-modules`。stacked Draft PR，未合併、不部署。

## 人事
HrOperationalPage 手機的四個頁籤（人員／排班／出勤／請假）使用 ModuleSections；人員清單 ListRow，搜尋／狀態 DataViewToolbar。員工詳細資料修改以 ActionBar 固定，刪除進 OverflowMenu，EmployeeForm 保留原 onSubmit/onCancel 並以 ActionBar 呈手機按鈕。手機窄版編輯列移入 shared CSS，桌機保持現狀。

## ERP
ErpItemQueryPage 外層類別選單用 ModuleSections，但 CategoryJob 仍全數 mounted，各 query state、結果、排程佇列、可見性 context 都不重建。ErpReceivableQuery 含展開明細的客戶表 cy-rt 和欄位標籤，RestockAssist 手機篩選 DataViewToolbar、總數量表 cy-rt，原 daily 模式保持桌機且 phone daily 禁用。新增叫貨選擇對話框與防重複業務未修改。

## BOT
BotCenterPage 在手機以 OverflowMenu 提供重新整理、查看回報與設定。審稿和憑證表改 cy-rt，保留所有 approve/reject/retry/issue/revoke/push 原 handler 與 permission gate。桌機原 toolbar、審稿表和 Modal 結構不變。

## 風險與驗收
- 響應式條件只有 shared useCompactLayout/@media820，原 Worker／D1／CYID／API／session／查詢任務不變。
- CI TypeScript/Node/Worker/D1/治理與部署契約待回報；手機390x844、桌機1440px 前後實機截圖待取得；Claude 最終審查待。
- **使用者明確禁止合併與部署。**
