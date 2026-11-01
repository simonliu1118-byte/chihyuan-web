# V0.9.60 Build1～2：登記高度、篩選、日期彈窗與歷程換行

2026-11-01 Asia/Taipei，分支 `cyweb/store-register-height-0960-b1`，基於main `e3de4ad3c8e2c3a9b835d2aca917f33d50e50be0`。使用者授權單純UI修改合併部署；本輪仍依既有授權，Claude事後複審待填，GPT不代簽。

## 修改檔案／行為／原因

- `src/runtime/modules/store.css`：桌面821px以上登記由26×26改26×20px，定位改格內絕對置中，完全不參與列高計算；手機仍26px、static。文字／其他操作仍可決定自然列高，沒有硬鎖tr高度或裁切內容。
- `src/app.css` 新增黃色點用途token `--cy-warning-indicator` (#eab308)，只在門市訂購篩選的warning圓點使用，避免原warning深棕文字色拿來當黃色點；其他模組及Pill文字色不變。
- `StoreCustomerOrders.tsx`：上方取消篩選標題為「顧客取消」，狀態代碼／清單Pill／取消理由不改。顯示未結案／顯示全部使用與叫貨未到貨相同 `cy-op-button primary`，不再compact外框；過濾仍前端、預設全部。
- 日期小彈窗改明確垂直排列，四叫貨結果兩欄兩列，選中保持品牌底白字。日期與「無日期」同列（勾選在右），兩者同高32px／底部對齊，勾選仍停用日期。取消／儲存另起底列靠右。選供貨失敗隱藏日期但不再把操作擠到結果旁邊；四選擇不自行儲存，既有result／日期／通知契約不變。修正selector優先序，防止後方舊checkbox26px規則覆蓋對齊；選項box-sizing確保含邊框26px。
- 歷程chain啟用flex-wrap，每筆li flex:none／nowrap，箭頭仍屬下一筆的::before；整筆放不下時連箭頭一起換行，筆內時間／姓名／動作／說明不拆開，行距2px。單筆本身長過整個可用寬度仍保留既有水平捲動，不切斷或隱藏資料。
- BUILD升1（同項UI返修），VERSION維持0.9.60；架構／TODO／CHANGELOG／交接入口同步。本輪沒有Worker、API、SQL、schema、migration、資料回填、依賴或權限變更；沒有新增D1查詢與寫入。

## 驗證

- 最終 `npm run build`：browser／Worker typecheck、Vite通過，僅既有bundle提示。既有store-page **19/19**；純樣式與caption沒有新增鏡像測試，改用真瀏覽器目視與computed styles驗證。
- 隔離真Store前端／API／SQLite合成資料：桌面1600px登記26×20、absolute，手機390px仍26px／static；單行內容列31px（修改前也31px，其他操作決定最低列高），雙行LINE／聯絡資料仍49.28px。沒有宣稱所有列都因按鈕降低6px；保證新登記不再提供intrinsic列高。
- 待取貨圓點RGB234/179/8、上方顧客取消、實心toggle可見。叫貨彈窗寬202px，四結果2×2，無法訂購選中為RGB61/99/210＋白字，footer始終在選項下方且靠右；日期及無日期checkbox外框y相同、高均32px，勾無日期後DateInput停用，取消不提交。
- 六筆合成操作歷程在1508px可用寬度，前五筆同一行，登記取貨連箭頭從下一行開頭（x46，y448.30；前行y426.70），每筆19.59px未拆行；既有分頁／快取／事件資料未改。
- 本地證據在外層outputs：`store-0960-b1-date.png`、`store-0960-b1-unorderable.png`、`store-0960-b1-history.png`。僅合成資料，不提交圖片與正式資料；隔離預覽結束後關閉owned tab、還原viewport。

## 雲端CI／合併部署

### Build2範圍補正

PR336 source45618c5 Runtime41308311147完整Linux516/516、治理41308311086通過，合併259afac8d9b38de6d41293fdb71d0c654dbb48a4，部署41308496079。交叉檢查發現StoreMonthlyTodos也使用cy-store-date-popover，Build1新增的form flex會連帶讓月度按鈕縱排。此輪只將flex selector加cy-store-orders祖先，並恢復共用form>button原margin；訂購footer為div不受該margin影響，月度保持原版。BUILD升2，VERSION維持0.9.60；需重新CI／部署確認最終source，不能把Build1驗證代稱Build2驗證。

Build2最後build／typecheck通過，store-page19/19、store-monthly-ui5/5。真瀏覽器確認訂購form display:flex／column，月度form display:block、取消／儲存y同為290.08px；月度未提交辦理，仍為隔離合成資料。首次測試命令誤寫不存在的store-monthly-page檔名，Node只執行19項訂購；已用正確store-monthly-ui另跑5項，不把第一次19項冒稱兩頁全驗證。

### 最終 Build2 發布證據

- Source `07a8fd053c770a77ae87ddee2e2ff60cc5cd2910` 的 Runtime [41308811564](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41308811564) 全部成功，完整Linux **516/516**、0失敗；治理41308811585成功。PR [337](https://github.com/simonliu1118-byte/chihyuan-web/pull/337)合併 `04edf14a4c0ff79a4aff23b9223d9e1f0020fc74`。
- 最終受控[部署41308987671](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41308987671)的部署契約與deploy-development均成功。日誌 **No migrations to apply**，本輪沒有資料搬移、回填或新增業務D1查詢；未重跑正式全庫掃描。
- canonical／workers.dev雙入口 HTTP200、version0.9.60、consumer1.0.5、database ok、sourceCommit精確等於上述最終merge，314ms內both_targets_ready。BUILD2可由Git BUILD驗證，health版本目前只回傳VERSION、不假稱health另外有build欄位。
- HTTPS／HSTS／靜態資產、無效session清cookie、canonical正式authority檢查成功；dailyCatalogSchedule=true、monthlyTodoSchedule=true，backupSchedule維持false。
- 發布後同分支僅補本交接、TODO／CHANGELOG與入口，另開docs-only補件，不重部署相同程式。功能分支保留，沒有沿用上一個特定分支的刪除同意來刪本輪分支。

Claude複審待填，重點是桌面絕對定位不遮擋格內popover、手機尺寸、黃色點只影響門市篩選、四結果與footer穩定排版、歷程箭頭跟隨完整下一筆換行。單筆超長歷程仍水平捲動為已知限制；正式登入實機驗收待使用者。
