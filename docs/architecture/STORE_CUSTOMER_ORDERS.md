# 門市訂購 V0.9.64 契約

## V0.9.64 黑名單修訂

- 處置依序須全額預付／拒絕訂購／不保留商品／其他，NO_HOLD為獨立人工提示、不新增庫存連動。處置欄約10中文字，OTHER只顯處置內容、不加其他前綴。
- 移出保留灰字列，以一條水平線跨過所有欄位，不使用文字刪除線。移出必填理由只記operations，不覆寫名單原reason；加回、取消猶豫與歷史保留規則不變。
- 0041拓寬action CHECK並保全黑名單及兩個FK事件表，來源總數5000 guard；精確已知舊備份可升級空白新target。[交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-BLACKLIST-MONTHLY-0964-20261102.md)。

## V0.9.63 現行修訂

- 正常通知逾期門檻由7改14天，以台北日曆、通知隔日為第1天，第14天結束後才顯示逾期未取；例如11/1通知、11/16起逾期。無日期通知以實際確認日計算。清單及篩選同用STORE_PICKUP_OVERDUE_DAYS，取貨／取消／供貨失敗規則不變。
- 清單補填單價格沿用模組數字輸入去上下箭頭，數字及範圍驗證保留。無schema／資料回填。[交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-OVERDUE-14-DAYS-0963-20261102.md)。

## V0.9.62 現行修訂

- 所有結案均有5分鐘猶豫期。顧客取消也寫closedAt，僅可撤回至取消前狀態；日期／內容仍鎖。已取貨及供貨失敗通知結案保留原最後日期更正／退回，改日期重算5分鐘。舊NULL不解鎖。
- 撤回取消同步撤回本次新增／加回黑名單，復原inactive內容；原已active名單內容／處置不變。後續別人修改／追加事件時原子拒絕、先核對，原始歷史不刪。首次取消來源快照保留，重複取消每次完整快照由order events及blacklist operations記錄，不撞首次source的UNIQUE約束。
- 取消視窗288px、共用視窗邊界段落不疊上邊距；品項metadata輸入24px／12px。取消持續點選反藍，保留分組斑馬紋與控制項焦點。[驗證交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-CANCEL-GRACE-0962-20261102.md)。

## V0.9.61 現行修訂

本節依最新使用者決定取代下方衝突的舊版本行為；驗證見[交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-STORE-WORKFLOW-0961-20261102.md)。

- 新增客戶編號，客戶姓名必填。連絡電話1／2／LINE至少一項，純數字電話跨欄匹配，LINE同名須人工核對。mobile映射連絡電話1、phone映射連絡電話2；只有一號放1、手機優先1，兩欄均自動手機／市話格式。清單合併為連絡電話/LINE，表單分欄不變。
- 單價可空（NULL，與0元不同），未齊時總額／尾款空白、可先收訂金，補齊才可取貨。清單空單價格可單次補登，填後唯讀、後續走修改；補齊總額不可低於訂金。FULL_PAYMENT亦須齊價。
- 品項可展開選出版社＋作者或規格，清單只串非空值。備註輸入15字一行、自動換行、最多3行；既有長備註不截斷，server原300字上限保留。品項操作最新為左＋右刪除。
- 通知選未接通／客戶告知；未接通日期必填、不推進，紅日期＋小紅驚嘆號可再登記，前次只留歷程。連續第三次起提示轉取消，新增無法聯絡原因；成功接通回正常流程。通知附加10字告知不覆蓋原備註。逾期Pill最終「逾期未取」、黃底紅字。
- 取貨及供貨失敗通知結案後5分鐘內僅開最後日期更正／退回，改日期重算5分鐘，退回取消結案；其餘修改／取消仍鎖、超時鎖定。舊結案無closedAt不解鎖。server為權威，前端到期timeout不輪詢。
- 黑名單新增加入日期／項次，舊1、新在上；OTHER必填處置方式、理由全形逗號。移出保留灰字刪除線整列，按鈕改加回。加回走新增表單，沿用ID及歷史；直接新增／訂購轉入先核對既有同號／LINE，移出期間不套處置，不自動復活；取消選是才加回、否只取消。
- 黑名單操作含修改／移出或加回／展開歷程。timeline精簡：加入、移出、加回無詳情，修改只列變動，訂購取消只留原因。所有mutation、timeline、來源事件、audit原子提交。既有原始事件不刪、不捏造老手動歷程。
- 清單斑馬紋／反白以整筆tbody為單位；成功登記用server回傳該筆更新，不重新讀兩清單，舊response不能蓋新version。歷程parent/cursor索引、20筆分頁、60秒有界LRU；不同筆查看仍累積讀取，非零成本。
- Migration0038～0040及精確pre0033～0039 portable restore見資料字典；黑名單含移出上限1000，聯絡snapshot仍有全名單有界掃描成本。沒有叫貨／金流連動。

## V0.9.60 現行修訂

本節取代下方歷史版本衝突描述，完整驗證見[交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-STORE-DATE-NOTICE-0960-20261101.md)。

- 叫貨／通知／取貨三欄；叫貨四選一：已叫貨、缺貨、絕版/停產、無法訂購。後三種固定×鎖定，通知後結案，取貨不適用；篩選統整「無法訂購」，每列Pill保留各原因。
- 已登記的日期或無日期勾號在取消後保留，後續未完成步驟斜線；結案只有紀錄可用。日期滑過顯示完整年份；跨年小年份放MM/DD上方，固定內部高度，不撐高列。
- 數量在單價前；LINE約6中文字寬、超過折行，原有寬度移給備註。備註只顯示一次。搜尋左側「顯示未結案」／「顯示全部」預設全部，純前端切換，不新增查詢。
- 登記通知可填10字客戶告知，換行附加到原備註，與狀態／事件同一CAS及requestKey原子提交；原備註不覆蓋，合併超過300字拒絕。日期更正不重複新增客戶告知。
- 訂購歷程以舊→新箭頭串接；Build1每筆不拆行，放不下從下一筆箭頭起整筆換行。建立無詳情、登記不列作業日、取消只列理由，有客戶告知才列。舊到貨投影排除，原始事件不刪。20筆游標／60秒有界暫存保留。
- 訂購視窗外點／Esc不關、無右上X，由明確取消關閉。黑名單是／否小視窗；取消帶入理由格式為訂購日期＋訂購＋品名x數量＋逗號＋類別＋括號補充。
- Migration0037保全父子表ID與不可變事件，擴大call_result CHECK加入UNORDERABLE；四表總量5000筆guard，超過中止。精確pre0033～0036備份可升級空白新target，未知schema等防護不變。
- 共用數字日期輸入與compact／regular密度見[輸入契約](CONTACT_DATE_INPUTS.md)。
- Build1桌面登記26×20、絕對置中不撐列高（手機26不變）；待取貨篩選黃點、上方「顧客取消」、顯示未結案採共用實心primary。叫貨四結果2×2、日期與右側無日期同列、取消／儲存底部靠右；見[Build1交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-STORE-REGISTER-HEIGHT-0960-BUILD1-20261101.md)。

最新契約見下列 V0.9.59 變更；驗證與交接見 [交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-STORE-CONTACT-PROGRESS-0959-20261101.md)。

- STORE_CUSTOMER_ORDERS gate；正常 REGISTERED → ORDERED → NOTIFIED → PICKED_UP，欄位為叫貨／到貨通知／取貨；不可跳階。所有作業手動，沒有叫貨／ERP／通知／金流連動。
- 訂購、黑名單顧客姓名必填，電話／手機／LINE 至少一項。有填的號碼需合法。數字跨 phone/mobile 匹配，LINE 僅為非唯一名稱候選，由人員核對，不能自動合併。
- 每次異動帶 expectedVersion／requestKey；各步驟可選日期或明確無日期。日期更正不推進，退回保留原作業日；曾叫貨修改需理由，退回不能繞過。作業日與系統事件時間分離。
- 已取貨或供貨失敗通知結案後僅可看紀錄，內容／日期／取消／退回均鎖定，Worker同樣拒絕。訂金不得超過合計，尾款為合計減訂金，非收款結果。
- 黑名單處置 REFUSE=拒絕訂購、FULL_PAYMENT=須全額預付、OTHER=其他（人工依理由處理）。取消顧客原因若既有黑名單追加原因事件；新對象是／否後依選擇原子提交。手動黑名單允許零訂購事件，不自動加重處置。移出保留事件。
- 0033 migration 不清資料，保留舊 ORDERED 語意與原聯絡／品項 ID；舊通知日可取台北日期，其餘未知日期不捏造。新增業務歷程、黑名單事件列入 portable backup，精確 pre-0033 備份可升級到空白新版 target。
- GET orders 主表上限 500、黑名單 1000；history 20 筆游標分頁。黑名單並發以版本 snapshot 原子 guard 防止與取消／訂購異動競爭。

## V0.9.59 行為

- 叫貨結果只有已叫貨、缺貨、絕版／停產，結果屬整筆訂購，沒有逐品項部分缺貨。後兩者叫貨固定 × 不可編輯／退回，接續通知即結案，取貨斜線不適用，不走取消／黑名單；通知結案後不能更正或退回。
- 取消理由只有顧客取消、通知未取、其他；其他必填補充。是／否黑名單確認：是帶入或追加既有事件，否只取消；不自動加重處置。
- Pill：藍色訂購／已叫貨、黃色待取貨、綠色已取貨、灰色缺貨／絕版停產（通知結案仍保留原因）、紅色未取／取消。正常通知超過七天變未取，不顯示天數長句。無日期從實際確認通知日（台北）起算，更正不改確認時間，退回重新通知開新一輪。
- 清單項次查詢前依訂購日期、建立時間、ID 舊到新編號，最新置頂。只有品項／單價／數量分列，其他欄 rowSpan。訂購 YYYY/MM/DD、進度 MM/DD 或裸勾號，整格可按、下一步純文字登記。操作修改／取消／退回／紀錄固定四格，不可用則明顯停用。逐列框線及分段粗線沿用共用樣式。
- 稱謂空／MR／MS 獨立存放，姓名顯示附 `'r`／`'s`，不猜舊姓名、不改原姓名；帶入黑名單保留稱謂。電話／手機格式與純數字儲存／複製由 [共用輸入](CONTACT_DATE_INPUTS.md) 處理，聯絡三選一只在儲存時警告。
- 新增／修改 EntryTable 沒有重複欄內標題；左刪除右加列；合計對單價、訂金對金額、尾款對操作，備註涵蓋品號／品名／數量且不可拖曳。曾叫貨修改理由在視窗最上面獨立一列。
- 共用歷程每筆單行小字，時間／操作者／動作／變更及理由並列；只列異動欄位，長文省略且 title 可看全文；沒有舊版紀錄不完整提示。
- Migration 0035 刪除 arrived_date，舊 ARRIVED 轉 ORDERED，新增 honorific／call_result，已叫貨補 ORDERED；未知稱謂不猜測，舊無日期通知以原 updated_at 補確認時間。不可變歷史事件快照保留舊到貨欄，不是現行進度。
- TODO：未來叫貨系統連動再設計並新增到貨欄；現在沒有隱藏到貨日期。
- Portable backup 僅精確已知 pre-0033／0034／0035 schema 升級至空白新版 target，依 migration 同規則轉換；unknown-schema、scope／integrity、nonempty-target 防護不變。

## Build 1 修訂

以[本輪交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-STORE-HISTORY-DENSITY-0959-BUILD1-20261101.md)取代前版衝突描述：三欄叫貨／通知／取貨等寬；Pill置中、登記小方按鈕、四操作透明小圖示。建立紀錄不附詳情，推進顯示登記步驟／作業日，舊到貨事件不顯示但immutable原始事件保留。歷程索引游標分頁、模組內60秒有界暫存。

Migration0036持久 `list_sequence`，一次依訂購日期／建立時間（同日新在上；完全同時ID穩定排序）初始化；之後只有新增／改訂購日更新受影響區間，其他內容version不受項次位移影響。一般讀取依項次索引，不重跑全體ROW_NUMBER。精確pre0036備份也支援升級，還原補排序與migration相同。模糊搜尋及active黑名單snapshot仍有資料量成本，見交接D1審查。

Build2將登記外觀改為實心方塊、無外框／圓角；叫貨結果用三選一按鈕，預設已叫貨，切換不儲存，缺貨／絕版停產隱藏日期。進度日期輸入112px，月曆與其他模組共用日期尺寸不變。見[Build2交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff/CYWEB-STORE-REGISTER-FILL-0959-BUILD2-20261101.md)。
