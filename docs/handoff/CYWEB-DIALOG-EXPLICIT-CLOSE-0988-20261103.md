# V0.9.88 全系統視窗明確關閉交接（2026-11-03）

- 使用者直接交辦：全系統彈出工作視窗不能點旁邊就取消；同時有右上X與取消按鈕時移除X。沿用本對話單純UI修正可合併部署授權。不是Claude開立的工單；Claude最終複審待填，執行者不代簽。
- 分支 `cyweb/dialog-explicit-close-0988`，基底 main `ba1e4e6`（V0.9.87客戶頁），保留之前全部修改。PR [#379](https://github.com/simonliu1118-byte/chihyuan-web/pull/379)，最終CI／發布結果見下方。

## 修改與責任邊界

- Dialog.tsx 移除背景onClick關閉路徑，modal／Drawer／BottomSheet共用，無opt-in背景取消例外。新增 `showCloseButton` 只控制標題與hideHeader浮動X；預設true，不自動猜測內容或掃描DOM。
- 19處有明確取消的caller／shared wrapper設false，5處依實際畫面動態設定；原13處dismissible=false本來就無X，保持不變，其餘28處保留X。具體65處入口逐項列於下表（31個檔案，計程式入口而非執行時開啟次數）。
- 動態情況：帳號Email尚未進OTP時有取消、隱藏X，OTP階段仍保留退出方式；客戶拜訪／報價／常用商品編輯隱藏X，回到純查看恢復；商品新增瑕疵／報價隱藏X；請假新增有取消時隱藏，已完成假單與部分儲存附件流程沒有取消時保留原退出方式。
- ConfirmDialog／useFormPrompt集中移除重複X，涵蓋其所有呼叫者；未逐一複製確認UI。保留既有onCancel／dirty guard／busy及Esc邏輯，不將showCloseButton當成busy權限，焦點返回邏輯未改。
- 另檢查唯一原生dialog定義與Drawer／BottomSheet包裝；非模態SidePanel兩個入口（ERP佇列、進貨輔助）原本無背景取消，保留唯一X。門市訂購日期／單價、月度日期小編輯框原本沒有點外部取消邏輯，保持明確取消／儲存。
- 日曆、EntityPicker、叫貨來源picker及帳號選單屬欄位／導覽選項，外部點擊只收合選項，不取消工作視窗或清除表單資料，維持原操作。ERP「取消暫停」、設定面板內「取消一列編輯」不是整個視窗的取消，不能誤刪其唯一X。
- 不增加listener、observer、storage、第二套overlay renderer、API、D1查詢、schema或migration；不執行帳號、薪資、備份等正式業務操作。此次只改關閉呈現與互動入口。

## 修改檔案

- 共用：src/ui/overlays/Dialog.tsx、ConfirmDialog.tsx、useFormPrompt.tsx。
- Caller：SharedIdentityPage、BackupOperationalPage、CustomerOperationalPage、HrLeaveDialog、HrLeavePanel、HrOperationalPage、ItemOperationalPage、OrderingPage、OutsourcingMasterData、StoreStocktake、WorkLogOperationalPage。
- scripts/dialog-ui.test.mjs：三個主要回歸案例，使用實際元件的public actions；模態／抽屜／sheet背景忽略、X與Esc可退出；隱藏標題／浮動X後保留表單和取消；共用確認的busy防退出。原生showModal／focus另以瀏覽器驗收，不把元素樹測試冒充原生DOM測試。
- VERSION/package.json、CHANGELOG、TODO、OVERLAY_FEEDBACK_FOUNDATION及本交接同步。

## 驗證

- 共用元件3/3、build/typecheck與完整npm run validate:source通過。首次typecheck指出HrLeave completed為物件，已用!!completed轉成明確布林並重跑通過。
- 正式React CustomerOperationalPage＋合成API桌面1280：新增拜訪輸入合成內容，分別點同高度dialog空白區及上方backdrop，視窗保持open、文字原封保留、X數0、取消可見；按取消後dialog數0。
- 同一視窗查看→新增→取消編輯回查看，X數1→0→1；最終X可退出，焦點返回「查看全部」。
- 手機390：點背景後open與文字均保留，X數0、無document水平溢出，取消仍可退出。截圖repo外 outputs/dialog-explicit-close-0988.png、dialog-explicit-close-0988-mobile.png，全為合成資料，不放Public Git。驗收分頁已關閉、viewport還原、預覽服務停止。
- 全程合成GET、fixture禁止寫入，未接觸正式資料，實作驗收正式D1讀0寫0。CI／發布結果見下方；Claude複審仍待填。

## 逐項入口盤點

以下為本次source盤點，未聲稱逐一操作正式業務資料。全部共用入口都套用「背景不關閉」；關閉按鈕分類如下。

| 項次 | 入口 | X處理 |
| --- | --- | --- |
| 1 | `src/identity/CyInvoiceRecoveryAdminPanel.tsx:138` | 無同層取消，保留X |
| 2 | `src/identity/SharedIdentityPage.tsx:190` | 隱藏重複X |
| 3 | `src/identity/SharedIdentityPage.tsx:209` | 依畫面狀態顯示X |
| 4 | `src/identity/SharedIdentityPage.tsx:648` | 無同層取消，保留X |
| 5 | `src/identity/SharedIdentityPage.tsx:784` | 隱藏重複X |
| 6 | `src/identity/SharedIdentityPage.tsx:832` | 隱藏重複X |
| 7 | `src/identity/SharedIdentityPage.tsx:1038` | 隱藏重複X |
| 8 | `src/identity/SharedIdentityPage.tsx:1090` | 隱藏重複X |
| 9 | `src/runtime/modules/AuditOperationalPage.tsx:148` | 無同層取消，保留X |
| 10 | `src/runtime/modules/BackupOperationalPage.tsx:195` | 隱藏重複X |
| 11 | `src/runtime/modules/CustomerOperationalPage.tsx:757` | 無同層取消，保留X |
| 12 | `src/runtime/modules/CustomerOperationalPage.tsx:761` | 依畫面狀態顯示X |
| 13 | `src/runtime/modules/ErpAgentCredentialControl.tsx:159` | 無同層取消，保留X |
| 14 | `src/runtime/modules/ErpAgentCredentialControl.tsx:215` | 無同層取消，保留X |
| 15 | `src/runtime/modules/ErpHeldPrompt.tsx:21` | 無同層取消，保留X |
| 16 | `src/runtime/modules/ErpItemDialog.tsx:21` | 無同層取消，保留X |
| 17 | `src/runtime/modules/ErpOrderDialog.tsx:21` | 無同層取消，保留X |
| 18 | `src/runtime/modules/ErpPartyOrdersDialog.tsx:41` | 無同層取消，保留X |
| 19 | `src/runtime/modules/HrAttendancePanel.tsx:82` | 無同層取消，保留X |
| 20 | `src/runtime/modules/HrLeaveDialog.tsx:89` | 依畫面狀態顯示X |
| 21 | `src/runtime/modules/HrLeavePanel.tsx:118` | 隱藏重複X |
| 22 | `src/runtime/modules/HrLeavePanel.tsx:131` | 隱藏重複X |
| 23 | `src/runtime/modules/HrLeavePanel.tsx:142` | 無同層取消，保留X |
| 24 | `src/runtime/modules/HrLeavePanel.tsx:156` | 無同層取消，保留X |
| 25 | `src/runtime/modules/HrOperationalPage.tsx:405` | 隱藏重複X |
| 26 | `src/runtime/modules/HrOperationalPage.tsx:457` | 無同層取消，保留X |
| 27 | `src/runtime/modules/HrOperationalPage.tsx:474` | 無同層取消，保留X |
| 28 | `src/runtime/modules/HrOperationalPage.tsx:478` | 隱藏重複X |
| 29 | `src/runtime/modules/HrOperationalPage.tsx:630` | 無同層取消，保留X |
| 30 | `src/runtime/modules/HrRosterPanel.tsx:134` | 無同層取消，保留X |
| 31 | `src/runtime/modules/HrRosterPanel.tsx:151` | 無同層取消，保留X |
| 32 | `src/runtime/modules/HrSettingsButton.tsx:24` | 無同層取消，保留X |
| 33 | `src/runtime/modules/ItemOperationalPage.tsx:554` | 依畫面狀態顯示X |
| 34 | `src/runtime/modules/ItemOperationalPage.tsx:583` | 依畫面狀態顯示X |
| 35 | `src/runtime/modules/ModuleSettingsPanel.tsx:135` | 無同層取消，保留X |
| 36 | `src/runtime/modules/OrderingPage.tsx:622` | 無同層取消，保留X |
| 37 | `src/runtime/modules/OrderingPage.tsx:643` | 無同層取消，保留X |
| 38 | `src/runtime/modules/OrderingPage.tsx:650` | 隱藏重複X |
| 39 | `src/runtime/modules/OrderingPage.tsx:660` | 隱藏重複X |
| 40 | `src/runtime/modules/OrderingPage.tsx:682` | 隱藏重複X |
| 41 | `src/runtime/modules/OutsourcingMasterData.tsx:177` | 隱藏重複X |
| 42 | `src/runtime/modules/RestockAssist.tsx:248` | 既有不可隨意退出，保留 |
| 43 | `src/runtime/modules/StoreCustomerOrders.tsx:135` | 既有不可隨意退出，保留 |
| 44 | `src/runtime/modules/StoreCustomerOrders.tsx:136` | 既有不可隨意退出，保留 |
| 45 | `src/runtime/modules/StoreCustomerOrders.tsx:153` | 既有不可隨意退出，保留 |
| 46 | `src/runtime/modules/StoreCustomerOrders.tsx:154` | 既有不可隨意退出，保留 |
| 47 | `src/runtime/modules/StoreCustomerOrders.tsx:155` | 既有不可隨意退出，保留 |
| 48 | `src/runtime/modules/StoreCustomerOrders.tsx:165` | 既有不可隨意退出，保留 |
| 49 | `src/runtime/modules/StoreCustomerOrders.tsx:166` | 既有不可隨意退出，保留 |
| 50 | `src/runtime/modules/StoreCustomerOrders.tsx:167` | 既有不可隨意退出，保留 |
| 51 | `src/runtime/modules/StoreMonthlyTodos.tsx:107` | 既有不可隨意退出，保留 |
| 52 | `src/runtime/modules/StoreRepairPhotos.tsx:65` | 無同層取消，保留X |
| 53 | `src/runtime/modules/StoreRepairs.tsx:96` | 既有不可隨意退出，保留 |
| 54 | `src/runtime/modules/StoreRepairs.tsx:117` | 既有不可隨意退出，保留 |
| 55 | `src/runtime/modules/StoreRepairs.tsx:124` | 既有不可隨意退出，保留 |
| 56 | `src/runtime/modules/StoreStocktake.tsx:352` | 無同層取消，保留X |
| 57 | `src/runtime/modules/StoreStocktake.tsx:377` | 隱藏重複X |
| 58 | `src/runtime/modules/StoreStocktake.tsx:392` | 無同層取消，保留X |
| 59 | `src/runtime/modules/StoreStocktake.tsx:407` | 無同層取消，保留X |
| 60 | `src/runtime/modules/WorkLogOperationalPage.tsx:519` | 隱藏重複X |
| 61 | `src/runtime/modules/WorkLogOperationalPage.tsx:547` | 隱藏重複X |
| 62 | `src/ui/feedback/FeedbackProvider.tsx:58` | 無同層取消，保留X |
| 63 | `src/ui/overlays/ConfirmDialog.tsx:33` | 隱藏重複X |
| 64 | `src/ui/overlays/useFormPrompt.tsx:60` | 隱藏重複X |
| 65 | `src/ui/shell/AppShell.tsx:121` | 無同層取消，保留X |

## 最終CI與發布狀態

- Source head `13491b9954e6db35547ebd8039ec41559b235436`；[Runtime CI41482039610](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41482039610)完整Node **606/606**、本機D1 acceptance、browser／worker typecheck、source contracts及Vite build通過。Governance41482039410、deployment contract41482039591通過。
- PR379合併source `59ac3db8213b2e0df3b41ecf4cf1bd75c05320b3`；[部署41482521513](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41482521513)已成功上傳／啟用，但整體workflow為 **failure**：90秒健康觀測窗內兩入口仍回V0.9.87／舊source，正確擋下驗證；不能把此run寫成成功。
- Cloudflare唯讀控制面確認本次上傳為最新部署、流量100%，沒有其他同時部署。未盲目重傳；稍後同source唯讀複查canonical及workers.dev皆HTTP200、**V0.9.88／consumer1.0.5／sourceCommit精確一致／database ok／ready**，確認入口稍後已生效。發布生效超過既有90秒窗口，未在本UI任務修改等待窗口或部署pipeline。
- 接續以現有verify-secure-entry.mjs唯讀補驗，雙入口HTTPS／HSTS／靜態資源通過；兩入口以合成無效session補驗均401 AUTH_INVALID且清除cookie，未使用真實憑證。
- 剩餘production Identity authority以既有受控audit-identity唯讀operation補驗：[41484034477](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41484034477)，結果success，report明確productionPortalReady=true、canonicalProductionProviderVerified=true、healthMatchesRuntime=true、failureCode=null、mutationPerformed=false。沒有再次部署。
- 沒有新增schema/migration；標準部署migration metadata／health及補驗接觸D1，不提供列讀寫計數，不能將整個部署宣稱為D1零讀寫。新增UI判斷本身無D1 I/O；未執行正式業務異動、備份／還原或資源建立。
- 後續提交僅回填本handoff／TODO，不需重部署；Claude最終複審仍待填，未代簽。
