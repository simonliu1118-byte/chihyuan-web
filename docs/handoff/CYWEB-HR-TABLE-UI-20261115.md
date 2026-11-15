# CYWEB V0.20.3 人事第二批共用表格式介面交接

- 日期：2026-11-15（台灣）。V0.20.3 Build0；第二批介面整理為獨立項目，依Patch遞增。
- 使用者直接交辦第二批，原則為「與之前版面調整一樣，使用共同元件為基準，表格式介面不要欄位式」。依此整理既有畫面，不自行加入薪資規則或資料庫功能。
- 子分支：`cyweb/hr-table-ui-20261115`；父分支／PR #516：`cyweb/hr-attendance-fixes-20261114`；分支點`b7fdf078718a126a1f0bce0a2cd46208f860f806`，已包含毛利／品類及第一批修正。父PR #516與毛利PR #515不回寫、不合併。
- PR以第一批分支為base，Claude僅審第二批差異；父分支合併／base調整留有授權者處理。Runtime CI採既有任意base的PR驗證；Governance／部署workflow限main-base，本批不冒稱這兩項遠端有執行。
- 延用已讀三層治理、HR合約與UI_COMPONENT_CATALOG；本輪重新核對共用RecordSheet、RecordRows、EntryTable、EntryFields、DataViewToolbar、ExpandToggle、Field、820px手機規則與HR source。沒有改治理來源。
- 狀態：工程／本機自動驗證完成，待Claude審查及1440／390目視。**未合併／未部署**，正式D1讀0／寫0、遠端migration0；沒有每月薪資計算。

## 版面及操作結果

| 畫面 | 第二批調整 |
| --- | --- |
| 人員 | 保留RecordSheet檢視／修改同版面；薪資、狀態、年資不計及特休歷史視窗改共用表格；刪除確認改格內輸入 |
| 排班 | 保留原月矩陣、同格操作、鍵盤與分類；共用搜尋／篩選工具列，按員工／職稱顯示列；人員設定改員編／姓名／排序／豁免／操作同列 |
| 出勤 | 共用工具列；日期、排定、四個打卡、工時、加班及備註同表編輯；異常清單改日期／員編／姓名／異常表，不再串成段落 |
| 請假 | 共用員工搜尋／門市篩選；有效／已銷假／全部及日期／假別／事由搜尋；假單列日期、時段、假別、時數、事由／預支、狀態、操作 |
| 特休／補休 | 特休年度、預支來源與補休帳戶分表；補休來源／給予／到期／原始／剩餘／狀態／操作分欄，不再用長段文字混排 |
| 薪資 | 共用搜尋／門市／狀態工具列；經常性與非經常性津貼分欄，明示「月薪設定合計」「非當月實發」；歷次用共用ExpandToggle |
| 調薪 | 表內顯示目標員工與目前生效設定，帶入原計薪方式／本薪／津貼id、金額與經常性；未來生效紀錄不當成目前設定，原因仍需新填 |
| 視窗 | 請假、銷假、補休、特休調整、排班格、通知日期、狀態與年資異動均採EntryTable表頭在上、格內輸入；不另做直排欄位表單 |
| 設定 | 門市、職稱、班別、假別在同一張表同一列切換讀／寫；新增出現在表內空白列。津貼、最低工資與假日保留歷史列、表內新增 |

人員主檔原必填條件、單一緊急聯絡人及三種僱用型態不改；法定假別不可修改的額度／名稱／條件保持disabled與後端驗證。最低工資只增歷史，不新增覆寫。沒有新增稅費、保險、請假扣薪、月薪試算或淨薪概念。

## 共用元件與手機

- EntryFields增加可選columns（1至6）：每組輸出表頭列及輸入列，最後不足格用colSpan填滿；仍引用EntryTable、Field presentation=cell與EntryHeading。原未傳columns的列式呼叫完全保留，不改其他模組。
- 所有新編輯格用cy-sheet-input或共用Field，不在表格內另加有框線表單；重複資料用表格／既有RecordRows，不複製驗證、Dialog或保存owner。
- 資料清單採cy-op-table／cy-rt及data-label。展開列cy-table-expansion、密集矩陣cy-mobile-matrix與HR窄版修正在shared mobile.css集中至820px；移除HR模組640、700、701及自訂820分支，不另做手機API或表單草稿。
- 排班仍是月矩陣，手機使用共用可捲動矩陣，保留原同格編輯及表格式視窗；本批沒有另做單日／單人第二套排班畫面。
- 排班搜尋只篩顯示員工，鍵盤上下移動跟隨顯示列；每日人力仍全門市，工具列明示；列印標「目前顯示」。出勤搜尋只篩顯示日期／排定／異常，合計保持整月且有明示，不把篩選當新的計算輸入。

## 正確性、狀態與操作保護

- 第一批有效假單／銷假、精確分鐘、來源權威、寫入revision及超管API全部沿用，Worker／shared業務核心沒有修改。
- 調薪讀現有員工詳情與設定（非逐薪資列HTTP），以原生效日排序資料找今日有效紀錄。草稿複製值與津貼識別，不改原歷史；避免把時薪人員預設回月薪或漏掉津貼。沿用已使用但停用的津貼類型，避免儲存時無意刪除。
- 調薪快照尚未取得或失敗時不能送出，失敗提供重讀；寫入失敗錯誤顯示在視窗內、保留輸入。沿用請求序號及共用guard，送出以同步ref防連點。
- 設定內正在修改時鎖定其他列／種類切換，明確儲存或取消後再換，避免無提示丟草稿；變更、關閉及模組切換沿共用guard。設定類別／年度查詢加請求身分防護，不把舊類別資料套到新類別。
- 新增公司假別原本edit(null)不會讓空白表單出現，本次改明確editing狀態，表內空白列能正常展開；儲存失敗保留原值，原法定限制不放寬。
- 津貼新增只清其名稱；最低工資新增只清其日期／金額；切換既有項目啟停不清掉其他尚未儲存的新增草稿。新增／修改共用同步鎖防止連點。
- 請假銷假及附件按鈕仍攜原batchId／日期／attachmentIds，只有呈現改表格，未更換既有API或另存資料。

## 逐檔變更

| 檔案 | 修改與原因 |
| --- | --- |
| VERSION、package.json | 獨立介面整理升0.20.3、BUILD既有0保留 |
| src/ui/forms/EntryFields.tsx | 可選橫向表頭／輸入組，保留原預設；必填、標籤及colSpan仍由共用表格負責 |
| src/ui/mobile/mobile.css | 統一820px矩陣捲動、展開列及HR窄版，使用足夠specificity防止後載模組CSS蓋回桌機最小寬 |
| src/runtime/modules/HrAttendancePanel.tsx | 共用工具列、只篩顯示日期、同表輸入與cy-rt、異常表及表格式篩選 |
| src/runtime/modules/HrLeavePanel.tsx | 員工搜尋、假單狀態／日期查詢，假單／年度／補休／預支各分欄，共用表頭視窗，原動作保留 |
| src/runtime/modules/HrLeaveDialog.tsx | 正式假單與銷假採橫向共用表頭，第一批寫入／附件鎖與流程不改 |
| src/runtime/modules/HrRosterPanel.tsx | 共用工具列、顯示員工搜尋、矩陣捲動、鍵盤跟隨篩選列、人員設定同列編輯及表格式格子視窗 |
| src/runtime/modules/HrSalaryOverview.tsx | 共用工具列、津貼分欄、薪資設定合計標籤、共用展開控制及表格展開列 |
| src/runtime/modules/HrOperationalPage.tsx | 人事歷史表、刪除／異動視窗表格、調薪目標與生效快照、讀取防護／錯誤重讀與寫入鎖 |
| src/runtime/modules/hr-salary-draft.ts | 單一UI快照→草稿轉換，不計稅費／淨薪；過濾未來紀錄、不改歷史物件 |
| src/runtime/modules/HrPhase2aSettings.tsx | 門市／職稱／班別設定同列修改、假日表內新增；共用DateInput／TimeInput及刪除確認、查詢防護及送出鎖 |
| src/runtime/modules/HrLeaveTypeSettings.tsx | 假別同列編輯、公司假別空白新增列修復、保留法定限制、失敗留值及送出鎖 |
| src/runtime/modules/HrSettingsButton.tsx | 津貼／最低工資表內新增、歷史分欄、關閉guard與各自草稿清除，送出鎖 |
| src/runtime/modules/hr-operational.css | 移除HR獨立820分支及已不用的清單／歷史／設定排版，保留桌機表格尺寸 |
| src/runtime/modules/hr-phase2a.css、hr-phase2b.css | 移除640／700／701專用分支與出勤950px硬寬，保留月表列印與通知列印 |
| scripts/test-support/hr-ui-fixture.mjs | 從第一批抽出既有可控hooks／transport，供兩批測試共用，不複製整套runner |
| scripts/hr-first-batch.test.mjs | 改引用共用fixture、遍歷DataViewToolbar插槽；原6個行為測試保留，沒有刪除或降低斷言 |
| scripts/hr-table-ui.test.mjs | 6組新增測試：橫向格／預設相容、生效草稿、薪資表與展開、有效／銷假表及動作id、公司假新增與失敗留值 |
| docs/architecture/HR_MODULE_CONTRACT.md、UI_COMPONENT_CATALOG.md | 當前版面／表頭元件契約、820px、草稿來源、保留範圍 |
| TODO.md、CHANGELOG.md | 第二批工程待審、第三批仍未做及新版本 |
| docs/handoff/CYWEB-HR-TABLE-UI-20261115.md、README.md | 完整交接、來源／驗證／限制及Claude待審入口 |

## 驗證與操作量

- `npm run typecheck`、`npm run validate:source`及`npm run build`通過；Vite原大chunk提示保留。build／Wrangler僅使用scratch-only loopback shim處理本環境networkInterfaces限制，不進產品source。
- `node --test scripts/*.test.mjs`：**863通過、0失敗**（第一批857＋6組）；兩批target共12組亦通過。
- 新測試包含表頭／同格輸入／最後colSpan／必填屬性及原預設相容；目前時薪與津貼id保留、未來調薪排除與原歷史不變；薪資設定標籤與目標員工、共用展開；假單狀態篩選及原batchId；公司假新列能開啟且失敗留名稱／代號。
- 第一批正式假單／銷假SQLite、請求失效、防連點留表單、105人與455分鐘、共用guard測試全部保留通過，不用畫面改版迴避舊驗收。
- 本機Wrangler完整73個migration檔及19組Worker＋D1驗收通過，沒有新增Schema；部署契約本機通過，未執行部署。
- 主要列表沿用原GET；本機搜尋／篩選不發新請求；單次調薪開窗最多新增一個現有員工詳情讀取（已有相同員工快照時重用），沒有逐列GET或新資料儲存。所有寫入仍既有API與Audit。
- diff／相對連結核對，GitHub tree須與本機index一致；遠端Runtime以新子PR最新head checks為準，不借用父PR結果。

## 未完成與Claude待審

- **實際1440／390瀏覽器目視未完成**。本輪再次嘗試本機Chromium（headless／no-sandbox／single-process），仍因process singleton的socket()被環境拒絕而中止。沒有捏造截圖，hooks／元件測試不是DOM幾何驗收。
- 請Claude特別看：密集設定表格及多行備註、手機出勤13欄轉置／薪資展開／補休欄位、同列操作、必填星號與鍵盤、列印的目前顯示範圍、第一批保護及共用元件對其他模組相容。
- 本批沒有每月薪資、薪資扣款、保險扣繳、夜班規則、請假證明本體備份或正式資料操作；仍須另行需求／規則確認。
- Claude結論／日期：**待審查**；需修正項目：待填。不得由執行者代填通過；CI成功不構成合併／部署授權。
