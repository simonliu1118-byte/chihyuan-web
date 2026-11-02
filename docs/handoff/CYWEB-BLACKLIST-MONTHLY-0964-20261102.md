# V0.9.64 黑名單與月度待辦交接

2026-11-02 Asia/Taipei。分支 `cyweb/store-blacklist-monthly-0964`、base `b0c0bd1`。使用者要求完成所有新增修改並沿用合併部署授權；**Claude最終複審待填，沒有代簽**。首輪未發布，實際CI／部署與成本於同分支追加。前版0.9.63十四天逾期／補價去箭頭已部署，PR343／344證據獨立保留。

## 黑名單

- `shared/store.ts`：處置依序FULL_PAYMENT須全額預付、REFUSE拒絕訂購、NO_HOLD不保留商品、OTHER其他。NO_HOLD為人工處置提示，不新增ERP或保留庫存自動連動，也不強制全額訂金。新增表單原預設拒絕訂購未改。
- `StoreCustomerOrders.tsx`／`store.css`：處置欄10em＋padding／border（實測13px字143px，內容約10中文字）；OTHER僅顯actionDetail，不加其他前綴。移出列灰字保留，取消text-decoration，各td正中央銜接1px橫線跨全部9欄（實測九格lineY相同、沒有間隙、pointer-events:none不擋操作）。操作歷程列不劃線。
- 同檔：移出改必填理由小視窗、明確取消／移出，不外點／Esc關。`store-routes.ts` DELETE要求removalReason，理由只記blacklist operations，不覆寫原名單reason。版本、原子batch及既有inactive／加回／取消猶豫規則保留。
- `StoreOperationHistory.tsx`：NO_HOLD中文顯示、移出動作附理由，加入／加回維持精簡。新增API測試確認缺理由不移出、原reason不變、NO_HOLD可正常訂購。

## 月度待辦

- `shared/store-monthly.ts`／`monthly-service.ts`：台北每日午夜cron維持原0 16 * * *，16日起generation upper bound變次月，15日午夜前不預產；1日不重複產生已預產月份，missed-month catch-up／頁面補漏與CAS不變。實際currentMonth與預產through分離，設定生效仍以實際當月。
- `store-monthly-routes.ts`：頁面預設含預產次月，設定儲存補當月及已到預產時間的次月，名稱／門市排序更新這兩月。新增當月生效、停用／取消適用次月生效不變。預產後停用以periods過濾可見列／格及server mutation applicability；不刪既存格、完成／歷史不變，重啟可恢復。cell更新額外guard設定version避免與適用變更競爭。
- 同檔：項目note可選、最多300字，存items_json，不新增schema；舊client未送note時保留已有note。cell PATCH／重送／unchanged返回該格完整狀態；`StoreMonthlyTodos.tsx`只在server成功後更新該格、失效該列history cache，不重讀整份清單及已載入舊分頁，失敗保原狀。settings仍儲存後重載。
- `StoreMonthlyTodos.tsx`／`store-monthly.css`：主表分組斑馬紋／框線／粗分隔、56px日期格，實心矮登記、裸勾／純日期、跨年小年份及完整title；操作history無框24px，觸控36px。日期小視窗共用DateInput／Field／訂購同一CSS，日期左、無日期右、操作靠右；Enter略過無日期直接存。歷程共用chain，確認／取消完成只留項目，日期更正只留變動。
- 設定項目有項次、名稱、適用門市、約10字寬備註、操作；移除啟用欄、上下按鈕及逐列＋，唯一＋在操作表頭最右。新草稿可刪，已儲存項目為停用／啟用切換（表單按儲存才套用）。設定門市共用同一排序／操作模式，不新增備註欄。
- 原MonthlyTodos是唯一state/render owner，手把使用pointer capture及讀取命中列的Element位置，React重排rows，不直接搬DOM；鍵盤↑↓同樣可排序。沒有observer／retry／第二renderer。實測滑鼠拖曳水費到電費下方成功，儲存順序保留；設定權限仍只ADMIN以上，沒有新增設定權限旗標。

## Migration／備份

- `0041_store_blacklist_no_hold.sql`：擴大CHECK四處置。黑名單／來源事件／timeline三表總數≤5000才開始；staging複製所有欄及ID、先處理FK children再替換parent、恢復全部索引，不停用FK、不改原JSON或刪歷史。schema欄位不變，只有action接受值擴大。
- `store-progress-upgrade.ts`／`portable-backup.ts`：新增精確41 schema pins；已知40及所有既有舊schema可還原空白41 target。40→41資料不轉換、原byte reconciliation保留；更舊仍按原規則升級。`schema-columns.ts`由同鏈重產，無實質欄位差異。unknown schema／scope／integrity／nonempty防護不弱化。
- `store-backup-upgrade.test.mjs`：用正式export格式的pre41 bundle，逐列比對三表、snapshot原空白／FK保留及NO_HOLD可寫；5001來源拒絕前DDL、原5000筆operation保留。其他舊備份升級測試保留。

## 驗證與D1預算

- Build／兩份typecheck通過；重點107/107後再補16日真cron及0041上限案例。完整Windows555項547通過、8既有Windows URL／CRLF差異（未弱化測試），以LinuxCI完整結果決定發布。
- `store-monthly.test.mjs`驗證15→16台北午夜、月底不重複、catch-up、預產後停用隱藏但保留完成、重新啟用恢復、適用guard、note保存；真Worker daily cron16日重送不重複。`store-monthly-ui.test.mjs`驗證備註／次序payload、既存toggle、新draft刪除、無逐列＋及up/down，舊分頁保存時不再GET。
- 隔離合成真前端／API／SQLite瀏覽器：四處置順序、OTHER純內容、必填理由／跨9欄直線、實際pointer拖曳及儲存、表頭唯一＋／新草稿刪除轉已存toggle、當月／預產次月適用、DateInput Enter直接save。記錄顯示單次PATCH、無monthly list GET。月份fixture固定11/16顯示12月預產，非修改正式時間／資料。
- 外層outputs：store-0964-blacklist.png、store-0964-monthly-settings-final.png、store-0964-monthly-final.png為最新證據，沒有提交圖片／個資。驗收tab已關；本機服務已停，沒有viewport override。
- 正式唯讀preflight：blacklist16、source events5、operations29，共50列；ID總和分別32545985039207888／15／435、版本和27、內容字元300／925／3654。月度1列／15格／17事件、settings version17／through2026-11。metadata合計**讀84列、寫0**，無正式驗收資料。
- 以現50列估0041複製／移除及索引／schema成本，保守本次**讀≤5000、寫≤5000列**，對照[D1 Free](https://developers.cloudflare.com/d1/platform/pricing/)每日5M／100K為≤0.1%／5%，非宣稱帳號採Free或剩餘額度。guard5000是來源上限而非計費列數，若部署前明顯增長須重估；遇配額／費用告警停止，不重試繞過。實際計費metadata如CLI未提供需如實記錄，不能把command數當列數。
- 16日首次預產至多多產一個月；目前1列／15格配置約16個新row/cell加索引，之後每日through guard不重寫。設定最多處理當月＋次月，保留原1MB transport／800KB JSON限制，沒有新增項目數上限。history仍parent索引20筆游標／60秒有界cache，cell儲存減少整表讀取；未宣稱整個模組O(1)或零讀寫。

## 待辦

必要LinuxCI／PR／已授權合併部署、雙入口source／D1／HTTPS／排程、0041實際範圍／FK／snapshot保全與成本追補，均同分支回寫。Claude最終複審及正式登入／觸控實機驗收待完成；保留分支。
