# V0.9.60：日期密度、訂購紀錄與通知備註，交 Claude 複審

2026-11-01 Asia/Taipei；分支 `cyweb/store-register-fill-0959-b2`，PR #334，基於 main `13bc507f919bb386ea560b8fb39bda4167be7ec6`。使用者已授權「做完就合併部署」並持續追加本輪要求，依授權合併部署，Claude 事後複審待填，GPT 不代簽。新增叫貨結果涉及 CHECK/schema，升 V0.9.60 BUILD0；未發布的 V0.9.59 Build2 一併納入，沒有宣稱 Build2 已部署。

## 修改檔案與行為

- `StoreCustomerOrders.tsx`／`store.css`：承接 Build2 的無框實心登記方塊。清單數量在單價前；稱謂76px、從電話取寬；叫貨勾號整格置中。LINE 約6中文字寬、超過折行，不縮短資料，原10字相差4em轉給備註。備註只顯示一次，移除重複的 details 展開內容。
- 三進度日期 title 顯示完整 YYYY/MM/DD；若與訂購年份不同，在 MM/DD 上方顯示9px年份，內部固定26px、絕對定位，不增列高。取消後已叫貨／通知的日期或無日期勾號保留，未到達步驟斜線；結案仍只有紀錄可用。
- 搜尋左側新增「顯示未結案」，預設全部；按下僅顯示未結案、文字改「顯示全部」。本機過濾，切換會清除狀態篩選，不新增 API／D1 查詢。
- 叫貨四選一預設已叫貨，增加 UNORDERABLE 無法訂購，與缺貨／絕版/停產同為叫貨×鎖定、通知後結案、取貨不適用。個別列灰 Pill 保留實際原因；上方三供貨失敗合併為「無法訂購」篩選。文字統一 ASCII `絕版/停產`。
- 登記通知增加可選「客戶告知」10中文字；`worker/http/store-routes.ts` 以 server codepoint 長度驗證，附加換行至既有 note，不覆蓋。同一 expectedVersion／requestKey／CAS batch 寫狀態、備註與事件；重送不重複附加。合併後超過原300字上限則整筆拒絕，提示先縮短原備註，不截斷資料。
- `shared/store.ts` 取消帶黑名單理由：`2026/04/25訂購合成品項x1,顧客取消(已於別處購買)`，多品項以頓號串接，保留原聯絡資料／稱謂；理由300字限制不變，超長需人員縮短。
- 訂購相關 Dialog 全部 dismissible=false，移除X、外點／Esc不關閉，明確取消才關閉；LINE核對／對象選擇補取消出口。是／否黑名單視窗260px，無空白大表單。共用 `ConfirmDialog`／`useConfirmation` 新增選項，其他模組預設行為不變。
- `DataViewToolbar.tsx` 可選 beforeSearch slot；只訂購使用。`StoreOperationHistory.tsx` 可選 chain layout；只訂購採舊→新單一橫列，以箭頭相連，月度／黑名單維持逐筆列。建立無詳情；登記無作業日，客戶告知若有才呈現；取消僅理由。`shared/store-history.ts` 投影取消只保留理由，原始不可變事件不刪；舊 ARRIVED 仍排除一般投影。
- `shared/digit-input.ts` 抽共用純數字／游標／刪除；`shared/phone.ts` 重匯出既有電話別名，格式不變。`shared/date-input.ts`／`DateInput.tsx`：輸入只處理數字，即時補斜線，修復 `2026/0424`，支援4碼月日／8碼日期與全形；刪除跳過符號、複製剪下只含選中數字。可選 compact／regular density；`date-input.css` compact 月曆196px、輸入112px，regular230／142，觸控252／296。修正進度 popover 廣泛 button margin 影響月曆，限縮 footer selector。
- `migrations/0037_store_unorderable_result.sql` 擴大 call_result CHECK；重建父表與三個 FK 子表，保留 ID／欄位／版本／事件 JSON／request key，子表先備份再移除舊表，不關閉FK、不觸發級聯刪歷史，重建原索引。
- `worker/backup/{store-progress-upgrade,portable-backup,schema-columns}.ts`：註冊精確0037 LF／CRLF schema pins；0036欄位相同僅schema CHECK改變，空白target可升級。更早已知版本升級指向新pins；unknown schema／nonempty／scope／integrity防護不變。schema-columns僅重生來源註解，沒有增加欄位。
- `scripts/{date-input,store-page,store-route,store-history,store-backup-upgrade}.test.mjs`：數字輸入、剪貼簿／刪除、取消日期、四結果、結案、過濾、跨年、通知附加與重送、10字／300字原子拒絕、FK保留與舊備份還原、5000筆guard。
- `scripts/erp-business-query.test.mjs`：只修既有測試 setup，先 claim 第一工作再建立等待工作，避免同毫秒 created_at／隨機ID排序造成錯誤假設；未改ERP程式。PR334首輪 Runtime #41286911997 為502/503，正是此測試非確定性失敗，其他兩檢查成功；修正後重新跑整套。
- VERSION／BUILD／package、架構契約／資料字典／TODO／CHANGELOG／本交接與入口同步。

## D1 成本與 migration 範圍

發布前唯讀有界統計：orders29、lines29、order_events123、blacklist_events1，共182筆；API實測 rows_read182、rows_written0。未公開個資／資源ID。0037先以每表 LIMIT5001 的四個 count 檢查總計≤5000，超過立即中止、沒有 staging DDL；preflight最多讀20004列。現182筆預估重建複製約182列，另含舊列移除、原索引重建與少量schema記帳成本，保守預算讀≤5000、寫≤5000；若正式資料已成長超過此界限，不執行大型批次，需另作分段方案。遇配額錯誤停止，不自動重試。

沒有清單新增查詢／輪詢。既有主表500上限、黑名單1000、事件20頁／索引游標、60秒LRU20組／最多100事件暫存保留；展開單筆只取該單事件，超過20須按載入更多。大量查看不同訂購仍有累計讀取，不能宣稱零成本。搜尋／active黑名單snapshot與排序既有限制見前輪交接；「顯示未結案」純前端。

## 驗證與限制

- 最後 `npm run build` 通過 browser／Worker typecheck與Vite，僅既有bundle提示。
- 完整 Windows Node 512項：504通過，8項既有Windows路徑／CRLF限制（backup-rehearsal-http六項、deployment-source一項、secure-entry模組一項），不降低測試／validator；以 Linux CI 判定發布。
- 真SQLite forward0037保留 parent／line／order-event／blacklist-event ID與FK；超過5000 guard拒絕且原表事件未變；pre0033～0036精確舊備份升級／reconciliation測試通過。
- 本機 Wrangler 0037與37個migration鏈曾成功；之後新增首句5000 guard，由真SQLite測試驗證，正式雲端CI仍須驗證最新鏈。
- 真瀏覽器用隔離SQLite／真Store前端與API、合成管理員與資料：8碼／`2026/0424`即時格式、196px月曆、先生完整顯示、無X／外點不關、小是／否及理由帶入、取消勾號／日期保留、紀錄單行、篩選、LINE92px備註154px、跨年stamp26px（跨年列48.3px對正常49.3px）、通知客戶告知儲存附加與紀錄。沒有變更正式業務資料。外層outputs的 `store-v60-final.png`、`store-v60-entry.png`、`store-v60-date.png`、`store-v60-history.png`、`store-v60-blacklist-ask.png`、`store-v60-notification.png` 為本地證據，不提交圖片或敏感資料。

## 遠端CI／合併部署

- Source `a52ea3353b830d1bcb07d2fac77f8c98f8092f46`：Runtime [#41304511930](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41304511930) 全通過，完整 Linux **516/516、0失敗**；source validators／browser與Worker typecheck／build均成功。部署契約 [#41304511981](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41304511981)、治理 [#41304511934](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41304511934) 成功。
- PR [#334](https://github.com/simonliu1118-byte/chihyuan-web/pull/334) 合併 `89523975856a91a0440c95a6e6d371ece77947be`，受控 [部署 #41304711418](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41304711418) 成功。歷史 development-deploy 名稱發布既有正式服務，沒有另建資源。
- 最新37個migration本機CI完整鏈通過；正式0037 **26 commands／36.87ms**，migration記錄1筆、無殘留_v60表。更新前後四表 **29／29／123／1** 完全相同，訂購版本總和、各表ID總和（SQL轉TEXT避JS精度損失）、不可變事件JSON／request key長度總和均相同；FK check空集合。這是聚合保全檢查，非逐欄checksum；真SQLite測試另覆蓋逐列保全。
- 實際複製182列，符合預估資料範圍與5000 guard。Wrangler未輸出這26命令的計費 rows_read／rows_written，不把26命令或182列冒稱計費寫入數；索引／schema記帳仍有額外成本。本輪有metadata的發布前後唯讀驗證共讀 **4797列、寫0列**，其中全庫FK檢查3780、sqlite_master檢查288、migration命中1；不含部署本身與其他健康檢查。沒有配額失敗、無重試批次。
- canonical及workers.dev雙入口 HTTP200、version **0.9.60**、consumer1.0.5、database ok、sourceCommit精確等於上述merge；336ms內both_targets_ready。HTTPS／HSTS／靜態資產、無效session清cookie、canonical正式Identity與businessDB authority驗證成功；dailyCatalogSchedule=true、monthlyTodoSchedule=true，backupSchedule維持false。
- 本段為發布後同分支文件提交，另開docs-only追補PR，不重部署相同程式。後續程式變更須另分支與新驗證。

Claude 最終審查待填。複審重點：日期數字游標／密度、跨年不增列高、歷程chain分頁、取消不可變投影、通知備註CAS重送、UNORDERABLE所有結案路徑、0037 FK保全與精確backup schema pins。正式登入實機剪貼簿／觸控及實際同事操作仍待使用者驗收。
