# V0.9.59 Build 1：表格／結案／紀錄與 D1 讀取，交 Claude 複審

2026-11-01 Asia/Taipei，分支 `cyweb/store-history-density-0959-b1`，基於 main `c2e4bfa0cf79678b9965dcd345d94d87c1a34d57`。使用者既有授權做完合併部署；Claude 事後複審待完成，GPT 不代簽。此為同工作返修，VERSION仍0.9.59、BUILD升1。

## 需求與修改

- `StoreCustomerOrders.tsx`／`store.css`：Pill欄置中；通知表頭與標籤統一，三進度56px；登記26px正方小按鈕；操作22px、16px細線glyph、平時透明框／hover才顯框，四位置固定且disabled清楚。儲存格上下padding6→4px，不由操作撐高列。手機觸控操作仍保留36px，未修改盤點手機版。
- `worker/http/store-routes.ts`：正常取貨與缺貨／絕版通知結案後，修改內容／取消／退回／日期更正均拒絕；前端同步disabled，只有歷程可查。這取代上一版允許結案日期更正／退回的契約。
- `shared/store-history.ts`：舊推進投影為登記叫貨／通知／取貨，摘要只留作業日期（供貨失敗另保留結果）；建立不附詳情。刪除舊到貨步驟的顯示列及到貨欄，ARRIVED前態投影為已叫貨，通知事件保留。原始不可變事件不刪除，以便稽核／備份；一般紀錄API不再回傳ARRIVED。
- `StoreOperationHistory.tsx`：未知／空舊值不顯示空白箭頭；明確無日期→有日期才寫「無日期 → 日期」。單行小字／title保留。共用模組記憶體暫存20筆紀錄清單、每份最多100事件、60秒期限；讀取不續期，載入更多明確分頁；模組離開／登出即消失，成功異動清除。沒有背景輪詢或自動載入全部歷程。
- 訂購、黑名單、月度歷程SQL使用 `parent=? AND id<? ORDER BY id DESC LIMIT21`，移除 `(?=0 OR id<?)`，使深頁可從既有複合索引直接seek。一次最多讀21筆原始事件、顯示20；舊到貨列排除後可能少於20，但游標仍往下，不迴圈補掃。
- 黑名單清單60秒模組內暫存，避免搜尋訂購每次順便重讀黑名單；異動清除。空聯絡欄不發送預覽比對，儲存前與Worker仍重新驗證，不以暫存決定拒絕／全額預付。
- 使用者後續明確要求：同日期依既有建立時間新到舊，不另查建立事件；項次在新增／移動才更新。`migrations/0036_store_order_list_sequence.sql` 新增持久 `list_sequence`，一次依訂購日、建立時間、ID排名並建立清單／排序索引。ID只作完全相同時間的穩定tie-break，不新增業務判斷。
- `worker/store/order-sequence.ts`：新單同一原子batch計算位置並只遞增其後區間；更改訂購日只移動受影響區間，保留其他單內容version／事件。讀取不再ROW_NUMBER，不改日期的編輯不重排。並發位置在batch內計算，不依賴過期前端項次。
- `worker/backup/portable-backup.ts`／`schema-columns.ts`／`store-progress-upgrade.ts`：新欄位往返；精確pre0036也可升級空target，既有更舊備份依同排序補項次，不清理事件；未知schema、非空目標、scope及integrity防護不變。
- 測試：store-route／store-page／store-backup-upgrade更新新終止規則與欄位；新增store-history測試投影、空值箭頭、LRU／TTL／截斷游標；資料字典／契約／TODO／CHANGELOG同步。

## 驗證

- browser／Worker typecheck及Vite build通過，只有既有bundle／dynamic import提示。重點回歸 **66/66**。
- 完整Windows Node **497項，489通過，8項原有路徑／CRLF限制**（六項backup rehearsal、deployment-source、secure-entry載入）；未改弱測試，等待最新source Linux CI全驗。預期Linux多展開4項，實際總數以CI輸出為準。
- 真SQLite插入中間／同日新單、改日期往前／往後、其他單version不變與連續項次通過。一般清單 EXPLAIN 使用 list_sequence索引，沒有臨時排序或ROW_NUMBER。
- **一萬筆合成事件**測試深頁cursor100：使用 `idx_store_order_events_order (order_id=? AND id<?)`，沒有TEMP B-TREE；回20筆，未刪原始10003筆事件，ARRIVED不出API投影，通知保留。不是在正式資料庫製造壓力。
- local Wrangler0036成功，5 commands；FK check通過。schema pins：CRLF／目前本機 `1f7227750edf4433a5a8a7ff40177d4a6960d7e67ee2dcc21295b9f1e431cc45`，LF `e2637afff442e044414ba29532c444ae9d377e4b5be883f1d2020ee7e8af36ba`。
- 真前端＋真API＋隔離SQLite合成瀏覽器：1440px，三進度各56；Pill左右留白相等；操作22×22、登記26×26，雙行聯絡首列38.9px，單行可再縮；結案日期與前三操作disabled。歷程每筆22.6px單行，建立無詳情、登記只有作業日。收合再開同一紀錄，console捕獲history請求仍只有**一次**。本地完整圖 `outputs/store-0959-build1.png`。

## D1 讀取審查與邊界

1. 進頁不載所有歷程，展開才讀；每頁最多21原始事件，加上身份／模組／父紀錄及操作者索引查詢。不是全庫事件掃描。大量不同紀錄的首次展開仍各有一次API，不宣稱零讀取；60秒內重開已暫存清單不讀D1，超時／異動／重進模組重新讀。
2. 普通清單依持久項次索引取最多501筆（超500要求縮小搜尋），不再每次掃全體排名。跨欄 `%文字%` 模糊搜尋仍可能掃所有訂購及其品項；沒有聲稱模糊搜尋為常數成本。前端200ms debounce，狀態pill篩選在已載入資料上進行。
3. 聯絡資料的黑名單預覽／儲存並發snapshot目前仍會讀active blacklist，1001上限並拒絕超1000；有內容的輸入250ms debounce。若未來累積數百／千筆且多人持續輸入，這與模糊搜尋才是後續需針對性索引／查詢重設的候選；此次不拆掉避免併發漏判黑名單的guard。
4. 新增補舊日期、改訂購日期會寫入受影響項次區間，成本由「每次讀」移到「實際插入／移動」。最壞仍O(N)區間寫入，不適合無上限大量補單工具；目前無批量匯入功能。一般新增最新日期只改新單，其他單內容version不變。
5. 正式唯讀盤點：11訂購、45事件、0 active blacklist，**56 read／0 write**。0036只回填11項次、建兩索引，不重寫事件；預估含schema／index／ledger **<1000 read／<1000 write**，僅一次forward migration。相較[D1官方Free最低日額度](https://developers.cloudflare.com/d1/platform/pricing/)500萬read／10萬write，分別<0.02%／1%；未假稱確認付費方案／其他服務當日餘額。部署後補實際查核與可取得統計，不將Analytics延遲當0。

## Claude 複審重點

結案所有寫入入口鎖定；immutable source與投影邊界；原始頁游標不因過濾跳錯；暫存隔離／TTL／異動失效；持久項次的原子區間移動、同日排序、備份與migration等價；搜尋／黑名單仍有的讀取成本不得被包裝成全面解決。Claude結論待填，GPT不代填通過。

## 遠端驗證／合併部署

- [PR #332](https://github.com/simonliu1118-byte/chihyuan-web/pull/332) source `f7f3459b5c41ea236e48fe4f57f874ee91aa04ea`；[Runtime #41283324005](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41283324005) 全四jobs通過、完整 **Node501/501、fail0**；[部署契約 #41283324088](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41283324088) 與 [Governance #41283324128](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41283324128) 全綠。
- 合併main `06321f8446dbbc6260f0e7b5aec50525b268912a`，從main dispatch [正式部署 #41283473165](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41283473165) **成功**；台北2026/11/01 15:08，0036一次5 commands成功，11筆項次回填及兩索引建立，沒有刪事件。
- 雙入口health HTTP200：version0.9.59、consumer1.0.5、sourceCommit `06321f8446dbbc6260f0e7b5aec50525b268912a`、database ok；HTTPS／資產、Custom Domain、invalid-session清cookie、canonical production portal authority均成功。排程monthlyTodoSchedule／dailyCatalogSchedule=true、backupSchedule=false。
- 正式唯讀復核項次：11訂購、min1／max11／distinct11；原始事件仍45，0036 ledger存在。這次查核57 read／0 write，與部署前盤點合計 **113 read／0 write**；migration實際邏輯回填11列。Wrangler只提供command數，含索引／schema的獨占計費read／write未直接提供，不冒稱已完整量測；預估各<1000，未進行重跑或額外補資料。
- 此部署證據在原工作分支補記，純文件PR合併不重複部署同程式。Claude事後複審及使用者真實裝置驗收仍待完成。
- 當次唯讀Analytics補查：該D1資料庫UTC2026-11-01當日 **42,724 rowsRead／2,920 rowsWritten**（查核時點統計、有延遲、非本次工作的獨占計數）；沒有看到大量讀取異常，不代表同帳號其他D1用量。一般一單通常僅4個進度事件；20只是分頁上限，實際有幾筆回幾筆，不為每次展開固定取滿20。一萬事件全是本機合成測試。
