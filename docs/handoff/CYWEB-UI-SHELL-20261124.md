# CYWEB V0.27.0 Build 1 — 殼層與介面整理交接

## 狀態與使用者決策（2026-11-24）

- 分支 `cyweb/v0.27.0-ui-shell`，基於 `cyweb/hr-bonus-payments`（已含 #546 Build 3 與 origin/main #548）。沒有 migration，CURRENT_MIGRATION 維持 0082。未開 PR、未合併、未部署。
- Claude 最終審查：**通過**（2026-11-24），已檢視 1440／390 淺深色截圖與人員清單 API 篩選變更；使用者授權合併部署。
- 使用者決策（已核准的原型 t1／t2／t3／s2／s3）：
  1. 設定入口只有齒輪圖示、無框無底、hover 淡底；桌機在頁名右側，手機在頂端列右側鈴鐺前；名稱與提示「<模組>設定」。
  2. 手機頂端列：移除漢堡、抽屜與左緣滑動；CY 標誌回首頁；頁名按鈕「人事 ▾」開 4 欄圖示格底部面板；右側齒輪、鈴鐺、頭像；外觀切換只在手機收進頭像選單的「外觀」列；選單窄（200–220px）、列高 44px。桌機維持原樣。
  3. 月份選擇共用元件，不可打字、沒有 Ctrl+↑／↓；箭頭保留。
  4. 彈窗寬度：small 400、medium 560（預設）、large 860，依規則盤點全站。
  5. 人事設定：分類清單＋一次一張表；新增／修改開小視窗；狀態用標籤；國定假日年份「‹ 2026 ›」；手機先分類再進入。
  6. 人員清單：桌機列單行（編號→姓名→標籤…狀態），與客戶清單共用元件；姓名後為門市標籤（方框外框、無底色、小字、可省略）；三個篩選（狀態／門市／僱用型態）；排序不變。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `src/ui/shell/AppShell.tsx`、`AccountMenu.tsx`、`ModuleSettingsGear.tsx`、`src/App.tsx`、`src/app.css` | 新頂端列（CY 標誌、頁名按鈕、右側群組）、模組圖示格面板（`BottomSheet`，沿用桌機側欄的分組與連結規則，外部程式照舊開新分頁）、頭像選單外觀列；移除抽屜與手勢；齒輪元件。`pageTools` 桌機在頁名後、手機在右側群組。 |
| `src/ui/forms/MonthPicker.tsx`、`month-picker.css` | 共用月份選擇；`HrRosterPanel`、`HrAttendancePanel`、`HrPayrollPanel`、`MyProfilePage` 改用，各頁 `discard()`／`canLeave()` 未儲存確認保留。 |
| `src/ui/overlays/overlay.css` 與各頁 `Dialog size` | 寬度 400／560／860；盤點調整見 CHANGELOG；視窗專屬寬度例外（維修單、出機、訂購、黑名單、盤點紀錄、BOT 審稿、月度設定、到貨）維持原樣，文件化於 UI_COMPONENT_CATALOG。 |
| `HrSettingsButton.tsx`、`HrSettingsPane.tsx`、`HrPhase2aSettings.tsx`、`HrLeaveTypeSettings.tsx`、`HrPayrollSettings.tsx`、`hr-settings.css` | 人事設定重做；所有 API 呼叫、驗證、確認（國定假日刪除）、未儲存保護沿用；新增／修改走 `SettingsEditor`（Dialog）；修改／儲存按鈕各有 key 與 type。`HrPayrollSettings` 拆成法定級距與出勤更正授權兩個窗格（啟停現需在視窗填原因）。 |
| `src/ui/data/ResultRow.tsx`、`result-row.css`、`CustomerOperationalPage.tsx`、`customer-operational.css`、`HrOperationalPage.tsx` | 共用單行清單列與 `OutlineTag`；客戶清單改用，外觀（高度、內距、hover、選取底色與左側色條）不變。 |
| `worker/hr/hr-service.ts`、`worker/http/hr-routes.ts` | 清單 `storeId`、`employmentType` 篩選與 `store_name`；唯一後端變更。 |
| 測試 | `scripts/ui-shell-v0270.test.mjs`（新）、`hr-personnel.test.mjs`（清單篩選）、`hr-table-ui.test.mjs`、`mobile-shell-ordering.test.mjs`、`home-hub.test.mjs`（舊「手機無 CY 標誌」斷言改為新設計）。 |

## 驗證

- 全 Node 測試、`npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local`、`git diff --check`；結果見 PR 說明。
- 真實瀏覽器（Vite＋合成 API）：1440×900 與 390×844 的齒輪位置、手機頂端列與模組面板、頭像選單外觀列、人事設定（桌機與手機）、月份選擇、人員清單與客戶清單（淺色與深色）、手機篩選面板。截圖不放入 repo。

## 已知取捨

- 手機頂端列的 ERP 憑證控制（`ErpAgentCredentialControl`）仍在右側群組，寬度較窄的手機上沿用原本的省略顯示，未另行調整。
- 彈窗盤點只改明確屬於一般表單或短表單的視窗；含明細表格或專屬寬度的維持原狀。

## Claude 審查重點與部署界線

- [x] 核對手機頂端列：無漢堡、無抽屜、無左緣手勢；CY 標誌回首頁；頁名按鈕整塊可點；模組面板與桌機側欄的分組一致、目前模組反白、外部程式開新分頁。
- [x] 核對頭像選單：手機有「外觀」列（單一圖示循環切換）、寬 200–220px；桌機頂端列外觀切換與原頭像選單未變。
- [x] 核對各模組齒輪：名稱「<模組>設定」、桌機在頁名右側、手機在鈴鐺之前；ERP 憑證控制仍可用。
- [x] 核對月份選擇：不可打字、無快速鍵、min／max 生效、Esc 只關閉月份面板；四個頁面的月份切換仍會問未儲存。
- [x] 核對彈窗寬度 400／560／860 與盤點結果、沒有視窗被誤縮到內容放不下。
- [x] 核對人事設定：九個分類、新增／修改視窗、既有驗證與確認、未儲存保護；修改／儲存按鈕不會再「按修改即送出」。
- [x] 核對人員清單：單行、門市標籤與狀態標籤明顯不同、三個篩選與分頁、`storeId`／`employmentType` 無效值被拒絕、排序未變；客戶清單外觀不變。
- [x] Claude 記錄最終通過／需修正，執行者不代填。使用者另行授權後才可開 PR、合併、部署。
