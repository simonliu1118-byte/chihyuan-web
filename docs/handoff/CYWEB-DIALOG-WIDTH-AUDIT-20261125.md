# CYWEB V0.29.3 — 視窗寬度全面盤點

## 狀態

- 分支 `cyweb/dialog-width-audit`，基於 origin/main（V0.29.2）。版本 V0.29.3、Build 0（新的獨立修改項目，Z + 1）。沒有 migration；未開 PR、未合併、未部署、未碰正式 D1。
- 規則（使用者 2026-11-24 核可，已寫在 `UI_COMPONENT_CATALOG.md`）：small 400＝確認、理由、一兩個欄位；medium 560（預設）＝一般表單（約 6 欄以內或短的 2–3 欄輸入表）；large 860＝多欄表格、明細、需要的格線。更寬只有寫明理由時才允許，窄螢幕時表格區在視窗內捲動。

## 結果

- 盤點 93 個 `Dialog`／`Drawer`／`BottomSheet` 呼叫（另有共用 `ConfirmDialog`、`useFormPrompt`、`FeedbackProvider` 提示框，一律 small 或 mini，未動）。
- 修改 14 個視窗：移除 8 個專屬寬度覆寫（BOT 設定 720、BOT 推播 414、BOT 審稿 1040、模組設定 520、訂購 840、黑名單 840、出機補填財產編號 620、忽略底稿 496），改用標準尺寸；另有 6 個欄位偏多的 small 或偏簡單的 large 改尺寸。
- 保留 5 個專屬寬度並寫明理由：維修單 1080、月度待辦設定 1080、出機單 1160、過去盤點紀錄 1700、登記到貨 1120（皆為對齊網格或寬表，試過 860 會裁切或擠壓者保留）。另有 3 個比 small 更窄的是／否確認框（288、max-content）維持。
- 其餘 79 個已符合規則，不變。

## 判斷依據

- small 表單的欄位門檻：1–3 個維持 small；4 個以上改 medium（叫貨來源 5、加入叫貨單 4+、代工單價 4、驗證碼與 Email 安全設定 4）。
- 新增瑕疵紀錄是一般表單，改 medium；同一個視窗顯示瑕疵清單時維持 large。
- 維修單、月度待辦設定在 860 實測會裁切或擠壓欄位，因此恢復專屬寬度並在 CSS 註解寫理由。
- 沒有修改共用格線元件；窄化後的視窗（訂購、黑名單、BOT 設定、BOT 審稿、推播、忽略底稿、模組設定）實測沒有橫向溢出。

## 完整盤點

| 檔案 | 視窗名稱 | 原寬度 | 新寬度 | 理由 |
| --- | --- | --- | --- | --- |
| identity/CyInvoiceRecoveryAdminPanel.tsx | CYInvoice 裝置災難復原 | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| identity/SharedIdentityPage.tsx | 變更密碼 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| identity/SharedIdentityPage.tsx | verifyingCurrentEmail ? 驗證目前 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| identity/SharedIdentityPage.tsx | Drawer：employee.name | 560（抽屜） | 560 | 不變：Drawer 預設 medium。 |
| identity/SharedIdentityPage.tsx | 新增使用者 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| identity/SharedIdentityPage.tsx | 移交超級管理員 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| identity/SharedIdentityPage.tsx | registration.existing ? 系統設定 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| identity/SharedIdentityPage.tsx | 變更驗證碼與 Email 安全設定 | 400 | 560 | 4 個數值欄位，改 medium。 |
| BackupOperationalPage.tsx | 驗證隔離還原 | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| BotCenterPage.tsx | attentionBot.label+(attentio | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| BotCenterPage.tsx | 今日發布的貼文 | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| BotCenterPage.tsx | 今日完成時間軸－全部 | 860 | 560 | 今日完成時間軸是單欄清單，不需要表格寬度（large→medium）。 |
| BotCenterPage.tsx | BOT 回報紀錄 | 860 | 不變 | 回報紀錄含展開明細，維持 large。 |
| BotCenterPage.tsx | BOT 設定 | 720（CSS 覆寫） | 860 | 連線憑證表 5 欄含 4 個操作鈕，改用標準 large，移除專屬寬度。 |
| BotCenterPage.tsx | tokenOwner+連線憑證（只顯示這一次） | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| BotDecisionDialog.tsx | draft?.title??拍板事項 | 560 | 不變 | 拍板事項含文字內容、選項與備註，維持 medium。 |
| BotDecisionDialog.tsx | 圖片 | 860 | 不變 | 圖片檢視，需要大尺寸，維持 large。 |
| BotDeliveryDialog.tsx | detail?.item.title??發布內容 | 860 | 不變 | 發布內容明細，維持 large。 |
| BotDeliveryDialog.tsx | 圖片 | 860 | 不變 | 圖片檢視，需要大尺寸，維持 large。 |
| BotPushSettingsDialog.tsx | label+'推播設定' | 414（CSS 覆寫） | 400 | 兩個欄位的小型設定，改 small 並移除專屬寬度。 |
| BotReviewDialog.tsx | onlyItemSeq!==undefined?visi | 1040（CSS 覆寫） | 860 | 審稿視窗是逐則文字與圖片的明細，860 足夠；移除專屬寬度，手機版覆寫保留。 |
| BotReviewDialog.tsx | 圖片 | 860 | 不變 | 圖片檢視，需要大尺寸，維持 large。 |
| BotSentPatrolDialog.tsx | title | 860 | 不變 | 巡視送出紀錄清單，維持 large。 |
| CnPurchasePanel.tsx | 取消訂購 | 220 | 不變 | 不變：單句確認（mini）。 |
| CustomerOperationalPage.tsx | 修改紀錄 — $selected.shortName | 860 | 不變 | 修改紀錄清單（表格），維持 large。 |
| ErpAgentCredentialControl.tsx | ERP 查詢程式 ·  + label | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| ErpAgentCredentialControl.tsx | ERP 查詢失敗 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| ErpHeldPrompt.tsx | ERP 暫停中 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| ErpItemDialog.tsx | 品號 $itemCode | 860 | 不變 | ERP 查詢結果表，維持 large。 |
| ErpOrderDialog.tsx | 單號 $orderNo | 860 | 不變 | ERP 查詢結果表，維持 large。 |
| ErpPartyOrdersDialog.tsx | $name ? name +   :  | 860 | 不變 | ERP 查詢結果表加日期篩選，維持 large。 |
| HrAttendanceCorrections.tsx | 更正誤打下班卡 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrAttendancePanel.tsx | 出勤異常清單 | 860 | 不變 | 出勤異常清單（表格），維持 large。 |
| HrBonusPanel.tsx | $employee?'獎金發放｜'+employee.e | 560（單一員工）／860（多員工） | 不變 | 單一員工為一般表單（medium）；多員工發放含員工表，維持 large。 |
| HrBonusPanel.tsx | 獎金紀錄｜$employee.employee_no | 860 | 不變 | 獎金紀錄表，維持 large。 |
| HrEmployeeSheet.tsx | 選擇綁定使用者 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrLeaveDialog.tsx | completed?假單／銷假:請假單 | 400（銷假）／860（請假單） | 不變 | 銷假只有原因一欄（small）；請假單最多約 8 個條件式欄位（3 欄排版），維持 large。 |
| HrLeavePanel.tsx | 給予補休 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrLeavePanel.tsx | 調整特休應給時數 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrLeavePanel.tsx | 特休書面通知 | 860 | 不變 | 特休書面通知為列印預覽，維持 large。 |
| HrLeavePanel.tsx | 請假證明 | 860 | 不變 | 請假證明為列印預覽，維持 large。 |
| HrLeavePanel.tsx | 假單法定全勤保護 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrOperationalPage.tsx | (動態標題) | 860 | 不變 | 人事歷史紀錄表，維持 large。 |
| HrOperationalPage.tsx | 刪除人事資料 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrOperationalPage.tsx | (action===status?新增狀態異動:acti | 860（薪資）／400（年資不計）／560（狀態） | 不變 | 薪資異動為 4 欄輸入表加津貼表（large）；年資不計 3 欄（small）；狀態異動一般表單（medium）。 |
| HrPayrollCorrections.tsx | cancel?'撤銷尚未套用更正':'新增前期薪資差額' | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| HrPayrollLegalCases.tsx | 核對法定計薪基準 | 860 | 不變 | 法定案件約 9 個欄位（3 欄排版），超過 6 欄，維持 large。 |
| HrPayrollMonthly.tsx | 變更預定給付日 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| HrPayrollProfileEditor.tsx | 薪資計算／投保設定 | 860 | 不變 | 薪資／投保設定欄位多（3 欄排版）加歷史表，維持 large。 |
| HrRosterPanel.tsx | emp?emp.name+ +cell?.date:排班 | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| HrRosterPanel.tsx | 門市人員設定 | 860 | 不變 | 門市人員設定是 5 欄表格，維持 large。 |
| HrSettingsButton.tsx | 人事設定 | 860 | 不變 | 人事設定是左右分欄的主從式版面，維持 large。 |
| HrSettingsPane.tsx | title | 依呼叫端 | 不變 | SettingsEditor 由呼叫端指定：假別／班別為 medium，職稱、國定假日、津貼、最低工資、授權為 small（皆 ≤ 3 欄）。 |
| ItemOperationalPage.tsx | relatedDialog === defectCrea | 860 | 560（新增）／860（清單） | 新增瑕疵紀錄是一般表單，改 medium；瑕疵清單仍是明細，維持 large。 |
| ItemOperationalPage.tsx | relatedDialog === quoteCreat | 860 | 不變 | 報價紀錄／新增報價含明細表，維持 large。 |
| ItemOperationalPage.tsx | 商品修改紀錄 — +selected.itemNo | 860 | 不變 | 商品修改紀錄表，維持 large。 |
| ModuleSettingsPanel.tsx | label + 設定 | 520／860（wide） | 560／860（wide） | 一般設定表單改用標準 medium（移除 520 覆寫）；計分與毛利設定是多欄表，維持 large。 |
| OrderingLinePhoto.tsx | name+ · 照片 | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| OrderingPage.tsx | 管理叫貨來源 | 860 | 不變 | 叫貨來源管理表，維持 large。 |
| OrderingPage.tsx | 已隱藏叫貨來源 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| OrderingPage.tsx | sourceForm.id?修改叫貨來源:新增叫貨來源 | 400 | 560 | 叫貨來源有 5 個欄位，超過「一兩個欄位」，改 medium。 |
| OrderingPage.tsx | receipt.receiptId?修改到貨:登記到貨 | 1120（CSS 覆寫） | 1120 | 不變：登記到貨品項表 9 欄以上（品號、品名、廠商品號、廠商品名、數量等），維持 1120，窄螢幕在表格區內捲動。 |
| OrderingPage.tsx | 指定結案剩餘量 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| OutsourcingMasterData.tsx | price.existing ? 修改單價：$price | 400 | 560 | 代工單價含商品搜尋、單位、價格等 4 個欄位，改 medium。 |
| OutsourcingOperationalPage.tsx |  issue:新增發料,receipt:新增交貨入庫,r | 400（結案）／560（付款）／860（其他） | 不變 | 發料、交貨、退料、盤點、對帳含明細表（large）；付款為一般表單（medium）；結案確認（small）。 |
| RestockAssist.tsx | 加入叫貨單：+row.itemName | 400 | 560 | 加入叫貨單有來源、區段、草稿、數量、單位等 4 個以上欄位，改 medium。 |
| RestockAssist.tsx | 已有同品號品項 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| StocktakeRecordsDialog.tsx | 過去盤點紀錄 | 1700（CSS 覆寫） | 1700 | 不變：過去盤點紀錄是多欄寬表（含展開歷程），維持 1700，窄螢幕在表格區內捲動。 |
| StoreCustomerOrders.tsx | 移出黑名單 | 288（CSS 覆寫） | 288 | 不變：是／否確認框，比 small 更窄，沒有被拉寬的問題。 |
| StoreCustomerOrders.tsx | form.order?修改訂購:新增訂購 | 840（CSS 覆寫） | 860 | 6 欄訂購明細表，用標準 large，移除專屬寬度。 |
| StoreCustomerOrders.tsx | 取消訂購 | 288（CSS 覆寫） | 288 | 不變：取消訂購確認框，同上。 |
| StoreCustomerOrders.tsx | 是否加入黑名單？ | 依內容（max-content） | 依內容 | 不變：單句是否確認框，寬度跟著文字。 |
| StoreCustomerOrders.tsx | black.entry&&!black.restore? | 840（CSS 覆寫） | 860 | 黑名單資料是 6 欄輸入表，用標準 large，移除專屬寬度。 |
| StoreCustomerOrders.tsx | rollback.order.status===CANC | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| StoreCustomerOrders.tsx | LINE 名稱可能同名，請核對 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| StoreCustomerOrders.tsx | 請選擇本次事件的黑名單對象 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| StoreEquipment.tsx | 補填財產編號 | 620（CSS 覆寫） | 560 | 3 欄小表，用標準 medium，移除專屬寬度。 |
| StoreEquipment.tsx | form.original?'修改出機':'新增出機' | 1160（CSS 覆寫） | 1160 | 不變：出機單是 18 欄對齊網格（表格最小寬 1060），維持 1160，窄螢幕在表格區內捲動。 |
| StoreMonthlyTodos.tsx | settings.kind===stores?設定門市: | 1080（CSS 覆寫） | 1080 | 不變：設定項目表有項次、名稱、適用門市核取清單、週期、備註、操作六欄，試過 860 會擠壓「適用門市」欄，維持 1080，窄螢幕在表格區內捲動。 |
| StoreRepairPhotos.tsx | 維修單照片 | 860 | 不變 | 維修單照片檢視，維持 large。 |
| StoreRepairPrintSettings.tsx | 列印設定 | 400 | 不變 | 兩個列印選項，維持 small。 |
| StoreRepairs.tsx | form.original?修改維修單:新增維修單 | 1080（CSS 覆寫） | 1080 | 不變：維修單是 9 欄對齊網格，試過 860 會裁掉右側欄位（LINE 名稱、配件備註），維持 1080，窄螢幕在表格區內捲動。 |
| StoreRepairs.tsx | cancel:取消維修,undoCancel:撤回取消維 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| StoreStocktake.tsx | 忽略底稿管理 | 496（CSS 覆寫） | 560 | 一個欄位加已忽略清單，改 medium 並移除專屬寬度。 |
| StoreStocktake.tsx | 新增批號 | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| StoreStocktake.tsx | ERP 儲位待手動修改 | 860 | 不變 | ERP 儲位待手動修改表（5 欄），維持 large。 |
| StoreStocktake.tsx | history.line.itemCode+／+(his | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| WorkLogOperationalPage.tsx | 審核工作日誌 | 560 | 不變 | 不變：一般表單或短清單（medium）。 |
| WorkLogOperationalPage.tsx | reasonDraft?.kind === cancel | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| ui/OrderingGrid.tsx | BottomSheet：(readOnly?查看:編輯)+品項：+(mobile | 手機底部面板 | 不變 | 不變：一般表單或短清單（medium）。 |
| ui/data/DataViewToolbar.tsx | BottomSheet：篩選 | 手機底部面板 | 不變 | 不變：一般表單或短清單（medium）。 |
| ui/feedback/FeedbackProvider.tsx | alert.title | 400 | 不變 | 不變：確認、理由或 1–3 個欄位。 |
| ui/shell/AppShell.tsx | BottomSheet：切換模組 | 手機底部面板 | 不變 | 不變：一般表單或短清單（medium）。 |
| ui/overlays（ConfirmDialog、useFormPrompt）、ui/feedback（提示框） | 共用確認／理由／提示框 | 400（mini 220） | 不變 | 不變：確認與理由框，small／mini。 |

## 瀏覽器驗證

證據在 scratchpad `dialog-audit/INDEX.md`（桌機 1440 淺色、手機 390 淺色）。已實際開啟並檢視：BOT 設定、BOT 推播設定、今日完成時間軸、BOT 審稿、門市新增訂購、新增黑名單、新增維修單（恢復 1080）、月度待辦設定門市／項目、忽略底稿管理、客戶模組設定、新增叫貨來源（桌機）。
**無法用模擬資料開啟、未驗證**：新增瑕疵紀錄（需商品資料）、加入叫貨單（需叫貨品項）、代工單價（需協力廠商資料）、驗證碼與 Email 安全設定（身分頁需完整身分資料）、補填財產編號（需出機紀錄）；這幾個只是改 `size`（兩者皆為既有標準尺寸），欄位為單欄堆疊，風險低，仍請審查時留意。
已知既有現象（非本次造成）：訂購、黑名單視窗的日期欄在桌機被裁成「026/11/25」，欄位窄所致，不在本次範圍。

## 測試

- 更新 `scripts/bot-center-ui.test.mjs`：改為斷言推播／設定視窗使用標準 size 且 CSS 不再有專屬寬度。
- 全套 `node --test scripts/*.test.mjs`、`npm run typecheck`、`npm run validate:source`、`npm run build`、`git diff --check` 結果見 CHANGELOG 與最終回報。

## Claude 審查

- [ ] 規則與盤點表一致（large 只用於表格、明細、列印預覽、圖片）
- [ ] 14 個修改視窗的尺寸合理，沒有欄位被撐寬或裁切
- [ ] 5 個保留的專屬寬度理由成立，窄螢幕時表格區在視窗內捲動
- [ ] 未驗證的 5 個視窗（見上）可接受或需要補驗
- [ ] 測試更新正確，沒有治理檔案被修改
