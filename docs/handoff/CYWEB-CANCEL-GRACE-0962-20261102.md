# V0.9.62 視窗密度與取消猶豫期交接

2026-11-02 Asia/Taipei。分支 `cyweb/store-cancel-grace-0962`，base main `3fb682e`。使用者延續授權合併部署，Claude最終複審待填、未代簽。首輪尚未發布，後續同分支追加實際CI／部署證據。

## 使用者定案

- 所有結案皆有5分鐘猶豫期：已取貨、供貨失敗通知結案、顧客取消（含通知未取／無法聯絡／其他）。有最後日期的仍可更正並重算5分鐘；取消僅可撤回到取消前狀態，不開放進度日期或內容編輯。舊closedAt=NULL不任意解鎖。
- 撤回取消時，同步撤回本次新增／加回的黑名單；原已active名單維持處置及內容。原始操作紀錄保留。若這次加入之後有人另改名單或追加其他訂購事件，整筆撤回拒絕並提示核對，不覆蓋別人的處理。
- 取消視窗縮窄20%，修復多個視窗首段留白。出版社／作者／規格輸入縮矮及小字；清單取消點選整筆反藍，斑馬紋與控制項focus保留。

## 修改檔案／原因

- `src/ui/overlays/overlay.css`：共用body首個p及form首個p的margin-top設0，body最末p移除外邊距，避免18px body padding又疊瀏覽器段落margin。只限定邊界段落，沒有全面壓扁內文／section間距。取消的caller僅一個FormSection，Reason回傳fields，移除重複section責任。
- `StoreCustomerOrders.tsx`／`store.css`：取消寬360→288px；metadata輸入34→24px、字12px，選擇按鈕22px。移除selectedOrder state、tbody click/focus handlers與data-selected樣式；黑名單tbody明確背景也不再透出共用focus列藍色，按鈕／輸入自身focus保留。取消5分鐘內顯示可用「撤回取消」，表單標題／理由／按鈕明確，其他操作及進度日期仍停用；撤回成功只更新server回傳order，失效受影響黑名單cache。
- `shared/store.ts`：canAmendClosure涵蓋CANCELLED，300000ms邊界及舊NULL策略不變。`worker/http/store-routes.ts`：取消寫closed_at，rollback分支從最後原始取消事件before取回原狀態；清取消欄、日期及通知嘗試保留。CAS／requestKey、server期限仍為權威。
- 同檔：取消事件after記本次黑名單新建／恢復前snapshot與預期version（一般history投影不顯示snapshot）。撤回新建則soft-remove；撤回恢復則回復原inactive欄位／加入日／activation_at，原created_at與ID不變。檢查黑名單version及取消timeline anchor後有無新事件，transaction內重查同樣guard；任一衝突不改訂購也不改名單。原已active名單只補「撤回訂購取消」歷程，不改內容／處置。
- 原 `store_blacklist_events.order_id UNIQUE`保留每筆訂購的首次取消來源快照，不刪不改。撤回後再取消，若已存在首次source則不重插，完整每次取消寫store_order_events及store_blacklist_operations（帶當次orderDate／lines快照）；避免重複取消撞UNIQUE，也不丟失第二次品項快照。無schema／migration／bulk作業。
- `StoreOperationHistory.tsx`：撤回取消只顯理由及是否同步撤回列入名單；撤回列入名單只顯動作，不外露rollback snapshot。
- `scripts/store-route.test.mjs`：三種原狀態取消／撤回、日期不解鎖、期限／舊NULL、首次新名單撤回、原inactive全欄回復、原active不變、再取消、後續名單／其他事件阻擋且原子無部分更新。
- `scripts/store-page.test.mjs`／`store-note.test.mjs`：取消grace只開撤回、日期／內容仍鎖，移除舊反藍斷言、嚴格五分鐘邊界。原form-fields validator未削弱，caller明確共用FormSection且DOM只有一層。
- VERSION／package 0.9.62，Build0。架構／資料字典／TODO／CHANGELOG本輪同步。

## 驗證與成本

- Build及browser／Worker typecheck通過，重點76/76。Windows完整首次548項539過、9失敗：8既有平台差異，另1為取消caller未直接標明FormSection、已修成caller唯一section並通過76重點，最終完整LinuxCI決定發布。
- 合成真前端／Worker／SQLite瀏覽器：取消288px、header到姓名18px且paragraph margin0、nestedSections0；從訂購轉黑名單視窗首段亦18px，既有是／否特定間距不變。出版社／作者及規格均24px／12px；點選主表整筆前後15格顏色相同。取消→加入黑名單→撤回，訂購回REGISTERED、名單灰線inactive且歷史留存。外層outputs：store-0962-cancel-spacing.png、store-0962-cancel-undo-blacklist.png、store-0962-metadata-compact.png；不提交合成截圖／正式資料。
- 沒有正式資料遷移／回填／大量核對。新增讀取僅使用order事件parent/id與blacklist operations parent/id索引，最後取消與anchor取LIMIT1、後續事件EXISTS/LIMIT1；黑名單row PK、version guards。每次撤回最多改1訂購／1名單，追加2業務歷程及既有audit，沒有清單輪詢或逐列讀歷程。source首次快照UNIQUE order_id索引判存在。並非零讀寫，不設定新雲端資源。
- State/Render owner仍CustomerOrders，共用Dialog/CSS為間距owner，Worker為mutation owner；刪除持續選取state/listeners，沒有新增observer／retry／第二renderer。既有legacy source保留first snapshot與新timeline完整事件責任已明確分開。

## 待辦

必要CI／合併部署／雙入口source及D1／HTTPS／排程證據追補；Claude事後複審與正式登入、實際同事／觸控驗收。保留分支。
