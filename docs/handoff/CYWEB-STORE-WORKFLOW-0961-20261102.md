# V0.9.61 門市訂購／黑名單交接

2026-11-02 Asia/Taipei。分支 `cyweb/store-blacklist-fields-0961`、base `2e35d7d`。使用者直接交辦並授權完成後合併部署；**Claude最終複審待填，未由執行者代簽**。首輪提交尚未發布，發布後同分支追補證據，保留功能分支。

## 修改檔案與行為

- `StoreCustomerOrders.tsx`：登記／日期／退回／補單價在server確認後直接更新該order，不再重讀兩份清單；失敗保留draft，晚回舊list不能覆蓋新version，只失效該筆history。新客戶編號、客戶姓名、連絡電話1／2及LINE合併顯示，主表15欄。Pill最終逾期未取、黃底紅字。
- `store.css`：整筆tbody斑馬紋、點選／focus整筆反白，續列品號品名左齊，單價末格邊框恢復，數字右齊／操作表頭置中。toolbar margin與外層gap不疊加；取消360px、黑名單是／否142px且文字與按鈕隔20px。
- `StorePage.tsx`／`App.tsx`：頁籤門市訂購、模組灰字更新。`VERSION`／`BUILD`／package：0.9.61 Build0。
- `shared/phone.ts`：兩欄auto格式，mobile=連絡電話1、phone=連絡電話2，僅一號移1、手機優先1，保留所有數字；新寫入亦正規化。共用PhoneInput純數字儲存／複製，黑名單同步。
- `StoreOrderLines.tsx`：stateless共用EntryTable品項列，仍由CustomerOrders唯一持有state；最新要求左＋右刪除。單價非必填，品名格右小展開BOOK出版社／作者或SPEC規格，只串接非空值、不多斜線。日期112px、聯絡126px、稱謂84px。
- `StoreNoteInput.tsx`／`shared/store-note.ts`：每行15 Unicode字元、自動換行、最多3行；阻擋第46字與超量貼上、IME及跨自動行Backspace。既有長備註不截斷，可逐步縮短。通知附加與舊資料可能超過新輸入上限，server原總300字限制不變；清單最多3行。
- `enter-advance.ts`：data-enter-skip只略過無日期checkbox，通知日期Enter到客戶告知再儲存、其餘日期Enter儲存，Tab不變。`DateInput.tsx`／date-input.css：不合法整格紅框擋提交、不跳原生泡泡。
- `worker/http/store-routes.ts`／`shared/store.ts`：CONTACTED／UNREACHED通知結果，未接通必填日期、不推進；最新紅日期＋9px紅驚嘆號留在56px格內，可再試，舊日期留事件。第三次起詢問轉取消，理由新增無法聯絡；接通清當前未接、正常推進，取消保留最新未接及既有日期。
- 同檔：單價NULL以pending旗標區別真0；未齊總額／尾款留白可先收訂金、補齊才能取貨。空格單次補價後唯讀，後續修改走原功能；補齊總額低於訂金拒絕。FULL_PAYMENT亦須完整價格。
- 同檔：取貨或供貨失敗通知結案記closedAt，5分鐘內只可改最後日期／退回取消結案；實際日期變更重算5分鐘。其他修改／取消仍鎖，超時server拒絕。舊結案closedAt=NULL不解鎖。前端一次到期timeout不讀D1。
- `StoreOperationHistory.tsx`／`shared/store-history.ts`：品項只列實際數量／單價等變動，省略衍生合計／空metadata差異；取消同步黑名單加列入黑名單。建立無詳情、登記不列作業日期，未接通留日期，整筆連箭頭換行；raw snapshots不刪。
- 黑名單：加入日期／項次，新在上、三處置篩選與專用搜尋，移除頂部筆數及訂購事件欄；理由全形逗號及剩餘寬，OTHER必填處置方式。移出保留整列灰字刪除線、修改停用，按鈕改加回。加回開新增表單、預設今日、沿用原ID／歷史。直接新增及取消轉入先核對同號／LINE；同名LINE由人員確認，避免誤合併。移出期間不套限制、不阻擋新訂購；取消選否不復活移出名單，選是才加回。
- 黑名單新增／修改／移出／加回／訂購取消同batch記timeline＋audit，操作欄新增歷程icon，同訂購chain／cache／游標。加入／移出／加回只顯動作，修改只列異動、訂購取消只留原因，老手動名單沒有歷史不捏造。
- `overlay.css`：重現heading點擊後ArrowRight使原生dialog根focus-visible，UA黑outline畫滿視窗寬度。根不畫outline、改白色surface內2px品牌焦點，輸入及按鈕focus保留。沒有第二renderer／observer／retry；目前state/render/mutation owners維持原模組與Worker，抽出品項列只替換render責任。
- 架構／資料字典／CHANGELOG／TODO同步。測試修改：date-input、shared-contact-date、store-page、store-route、store-history、store-backup-upgrade，新增store-note；validate_schema.py只加入新表expected set，沒有削弱validator。

## Migration／備份

- 0038：joined_date／action_detail，台北加入日／全形逗號回填、日期索引，blacklist≤5000 guard。
- 0039：order customer_code／closed_at／notification_attempts／last_unreached_date，line price_pending／metadata_mode／publisher／author／specification；兩父表聯絡順序正規化。orders＋lines＋blacklist≤5000，超限DDL前停止。原0元仍已知0；父子ID／version及immutable事件保留。
- 0040：activation_at回填created_at；新store_blacklist_operations、parent/id索引。舊blacklist_events保留原表，複製id、actor、at、reason、summary_json原bytes、source_order_id／legacy_event_id到timeline；黑名單＋來源事件≤5000。新取消仍寫來源事件並同batch寫timeline。
- `portable-backup.ts`／`schema-columns.ts`／`store-progress-upgrade.ts`：新表durable備份，三種換行精確pins，已知pre0033～0039可升級空白current target、與migration逐列相同；JSON空白及FK保留。未知schema／scope／integrity／非空target拒絕。

## D1範圍、成本及限制

最新唯讀聚合：orders108、lines118、order_events443、blacklist3、blacklist_events3。聯絡字元906／30、號碼92／3，需換位orders12／blacklist0。API metadata兩查詢**讀786、寫0**；較早本輪讀638、寫0，合計1424，不含更早V60查核。

本次migration範圍0038改3列、0039父子229列及111聯絡父表、0040更新3與複製3來源事件；CHECK／索引／schema亦有成本。保守本次預算**讀≤10000、寫≤5000列**，對照D1 Free每日5M讀／100K寫為≤0.2%／5%，不是宣稱帳號採Free或該額度尚未使用；其他服務共用成本不可推定。5000guard是資料範圍、不是計費列數。遇配額／費用告警立即停，不重試繞過；超界需另案分批。走既有受控migration chain，不另建資源。

清單不再逐列COUNT events；黑名單含移出最多1000（LIMIT1001判超限），聯絡核對snapshot亦有界但仍掃全名單，資料增大須改聯絡索引／server分頁。訂購上限500及模糊搜尋原成本不變。歷程只有展開才parent索引LIMIT21，顯20筆＋游標；60秒LRU20組／每組100事件，同筆重開不讀、不同筆仍累積讀取。新結案timeout不查DB，登記不再兩份GET。

## 驗證

- Build與browser／Worker typecheck通過。Windows完整540項532過、8既有平台限制（backup-rehearsal-http六、deployment-source CRLF一、secure-entry URL模組一）；後續3項及最後修改重點檢查更新於下。LinuxCI完整結果決定發布，不弱化驗證。
- 主要回歸：pending NULL／0／訂金／取貨阻擋／單次補價重送；未接3次／成功清除／取消日保留；5分鐘更正／重算／退回／逾時／供貨失敗；15×3／46字拒絕；舊list不蓋新version／失敗保draft；黑名單移出加回同ID／LINE核對／atomic rollback／inactive不限制訂購；精確舊備份及5000guard。
- 一萬筆合成operations驗證parent/cursor索引及20筆分頁。
- 真前端／Worker／SQLite隔離合成瀏覽器：上述流程、Enter、品項meta、一次補價、灰線加回歷程、142px是／否及20px間距、360px取消、原生滿寬outline before／after。正式業務資料未更動。
- 本機外層outputs證據（不提交圖片／個資）：store-0961-entry-final.png、store-0961-outline-before.png／after.png、store-0961-black-ask-final.png、store-0961-notify-history.png、store-0961-blacklist-lifecycle.png。舊orders.png不是最終15欄版本。

## 發布／複審

待必要CI、PR、受控部署、雙入口source／D1／HTTPS／排程核對、migration實際量與聯絡數字保全聚合、同分支文件追補。Claude重點：通知取消原子性、closedAt、pending價格0、聯絡數字、備註IME、0040來源保全、精確restore與inactive snapshot競爭。正式登入、實體剪貼簿／觸控與同事實際使用仍待驗收。

最後重點95/95與兩份TypeScript通過；新增store-0961-orders-final.png為整合主表畫面。

## 遠端驗證與正式發布（2026-11-02）

- Source `f0c9675659eb82726b2c3491662809ce36550f6e`，Runtime [41331649509](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41331649509) 完整Linux **547/547、0失敗**，source contracts、browser／Worker typecheck、Vite build全通過。治理[41331649529](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41331649529)、部署契約[41331649587](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41331649587)成功；完整40個migration鏈驗證通過。
- PR [339](https://github.com/simonliu1118-byte/chihyuan-web/pull/339) 合併 `d18d3dbbc7a4265a77b2770cd492f9bd7fd03bb9`；受控[部署41331933754](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41331933754)成功。沿用既有正式服務，歷史development名稱不表示另建測試資料庫。
- 正式0038／0039／0040分別 **6 commands/6.31ms、13/18.06ms、8/3.94ms**，合計27命令28.31ms；三筆migration記錄存在。Wrangler沒有回傳逐命令計費rows_read／rows_written，不能把命令數或資料範圍冒稱計費寫入量。已知0040實際複製3來源事件；metadata／索引仍另有成本，與預算差異無法精確量化。沒有配額告警或重試大型批次。
- 發布前聚合111訂購／121品項／448訂購事件／3名單／3名單來源事件；發布後112／122／453／3／3，期間使用者持續新增，故沒有宣稱全表數量或版本總和不變。所有舊訂購事件id≤448的**448筆／ID總和100576／JSON及request_key字元115461**完全相同；黑名單來源3筆／ID總和6／summary及reason字元475相同。新timeline三筆逐筆比對id、parent、source order、actor、at、reason、summary JSON，**3/3完全一致**；新表FK check空集合。
- 發布後需換位聯絡列**0／0**，名單聯絡字元30／3個號碼未變。訂購聯絡字元隨新增從935到944，不能把此動態聚合冒稱逐欄checksum；真SQLite migration／restore測試另已逐列驗證原數字保留。舊價格pending0、舊closedAt非空0，沒有把舊0元變未知或解鎖歷史結案。
- 本輪所有有metadata的唯讀聚合／保全檢查合計**讀3752列、寫0列**；不包含部署migration／health本身。相較先前預算，唯讀驗證在10000內，但migration計費量未由工具輸出，不能宣稱總計精確低於預算。D1目前額度／DDL與索引計量依[官方定價](https://developers.cloudflare.com/d1/platform/pricing/)核對；未宣稱帳號剩餘額度。
- canonical及workers.dev雙入口HTTP200、version **0.9.61**、consumer1.0.5、database ok、source精確等於merge；476ms內both_targets_ready。HTTPS／HSTS／靜態資產、無效session清cookie、canonical Identity及businessDB authority全部通過。dailyCatalogSchedule=true、monthlyTodoSchedule=true、backupSchedule=false保持不變。
- 本段及根TODO／CHANGELOG為同分支發布後docs-only追補，不重部署。Claude最終複審與使用者正式登入驗收仍待完成，功能分支保留；本機合成服務及驗收tab已關閉、viewport已reset。
