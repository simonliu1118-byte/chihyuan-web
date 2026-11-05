# V0.11.1 三年定期維護矩陣交接

- 2026-11-05（台灣），GPT；分支 `cyweb/maintenance-matrix`，基準 `9f43bc0c9f68844ef4de1bca70cada74fb790dcf`（V0.11.0）。
- 使用者在原出機功能完成部署後，另確認三年橫向矩陣、圖示／跨月／同日彙整的新設計，最後「可以做了」。沿用本功能明確特例「可以合併部署（寫handoff）」，通過CI後執行受控發布；**Claude事後複審待填，GPT不代填通過**。
- 依共通版本§6，新設計需求採 Patch+1：**V0.11.1 Build 0**，不重新升Minor。最新契約：[STORE_EQUIPMENT_MAINTENANCE](../architecture/STORE_EQUIPMENT_MAINTENANCE.md)。

## 行為

- 改用一客戶一列、三年36月份，年合併表頭＋月表頭；預設前／今／後年、可平移年窗。客戶欄與操作固定，手機維持表格內橫向捲動。
- 預計圓圈、隔月仍未去為三角驚嘆號；點選共用日期＋單行備註，沒有「登記」按鈕或無日期。不是逐台檢核。
- 實際到訪日期放到實際月份；原計畫保留去向並解除警示，不多建一筆到訪。**使用者本輪補充：去向「→」「8月」上下兩行、小字水平置中、固定24px高**；實測一般列32px，未高於改前33px（不同展開狀態的底框差1px）。
- 同日多計畫只顯示一個日期，不顯示「2筆」；點開才有各筆資料，可獨立修改。不同實際日期同格分行，允許列高增加。其他未完成安排仍獨立保留。
- 舊已完成無日期保留在原月份「補日」，不猜填、不刪資料；新登記／更正後端強制日期。取消登記仍可用，回復圓圈／逾期圖示。
- 原出機、快照、歷程及版本防護保留；刪掉的是舊逐到訪列UI。保留舊visits API供單筆與既有呼叫追溯。

## 修改檔案與原因

| 檔案 | 原因／內容 |
| --- | --- |
| shared/maintenance-matrix.ts | 純讀投影：年窗、實際日期歸位、同日合併、跨窗及舊無日期。 |
| src/runtime/modules/StoreMaintenanceMatrix.tsx | 新矩陣呈現、共用日期備註、同日展開、客戶出機來源與歷程；直接套用儲存回應。 |
| StoreEquipment.tsx、StoreAfterSales.tsx | 移除舊維護列UI，接新矩陣；出機清單保留。 |
| store-workflow/useStorePagedList.ts | 抽取原游標分頁／搜尋防舊回應，出機與維護共用。 |
| store-equipment.css | 矩陣固定欄、兩層表頭、月份密度、多日期分行、去向24px兩行、手機工具列密度；限定模組scope。 |
| src/ui/actions/icons.tsx | 既有共用圖示集中增加circle及warning，不做另一套按鈕。 |
| StoreOperationHistory.tsx | 客戶維護歷程加預計年月，避免多計畫的日期更正無法辨識；其他歷程不變。 |
| worker/http/store-equipment-routes.ts | matrix集合分頁、客戶歷程、新完成日期必填；原權限／防重送／版本／原子Audit不變。 |
| migrations/0052_maintenance_matrix_indexes.sql | 僅加維護客戶與已完成實際日期索引，沒有資料重寫或刪除。 |
| worker/backup/portable-backup.ts | CURRENT_MIGRATION=0052，欄位未改不用改schema-columns或UPGRADES。 |
| scripts/store-equipment.test.mjs | 23項實際handler/SQLite及純投影測試，新增跨月／同日／跨窗／50客戶分頁／歷程／補日，原無日期寫入測試改新契約。 |
| worker/acceptance/equipment-acceptance.ts | 真實D1增加matrix、客戶歷程、無日期拒絕。 |
| VERSION、package.json、架構契約／資料字典／UI目錄、TODO／CHANGELOG、handoff入口及本檔／圖片 | 版本、現行行為及可追溯驗證。 |

## D1與資料風險

- 所有API先驗證原STORE_REPAIRS權限；仍用參數化SQL，沒有新增身分、服務、cron或背景API輪詢。
- matrix每頁50客戶，多取1筆判斷下一頁。三個集合查詢：客戶、所有相關計畫／實際日期、一次讀去重的歷史來源。不是50×36個請求，也不由瀏覽器掃全部出機。各客戶相關月份完整傳回，不被舊100到訪上限截斷。
- 歷程展開才GET，每頁50筆、共用bounded LRU快取；未展開不預抓，儲存只清該客戶快取。儲存用單筆回應重新投影，不重讀全矩陣。
- 實際日期索引與兩個範圍UNION涵蓋計畫在窗外而實際在窗內的情況。舊資料完整保存；0052純索引，可攜備份round-trip通過。
- 窄螢幕每次只能看到部分月份，以表格內橫向捲動查看；固定客戶欄保留辨識。年度切換與搜尋會關閉目前編輯區，未送出的草稿不寫入。

## 驗證

- 最後相關測試77/77通過（出機／矩陣23項＋既有門市路由／維修／歷程）；型別、來源契約、共用表單／鍵盤檢查及建置通過。後續兩行去向修改再次typecheck及build通過；最後完整CI另列。
- 本機完整Node **645項／634通過／11失敗**，均與前版相同Windows基線：backup-rehearsal-http 6個503、deployment-source 1個LF/CRLF、secure-entry Windows URL pathname 1項、store-backup-upgrade 3個舊migration指紋。未改測試規避；LinuxCI為完整結果依據。
- 本機Wrangler D1：全部migrations至0052、19組Worker＋D1驗收均PASS（含新matrix／history／日期必填）。結尾TemporaryDirectory清理因Miniflare metadata.sqlite佔用WinError32，D1指令exit1；外層輸出log命令的exit0不代表驗收指令成功。
- 瀏覽器使用真實React及真實handler＋合成SQLite，沒有正式D1／R2寫入。確認圓圈、逾期三角、跨月、同日只顯示一次／展開兩筆、改成不同日期分行、取消登記回復警示、日期Enter到備註再Enter儲存、客戶歷程按需讀取。
- 1920px桌面可完整顯示三年36月；390px手機body.scrollWidth=390、表格內scrollWidth=1611，頁面本身不溢出。兩行去向高度24px，水平中心與含邊框儲存格中心差0.5px（1px框線）。
- 圖片均為合成資料實際頁面，已目視檢查；正式採用前git read-back核對如下。

| 圖片 | 尺寸 | bytes | SHA-256 |
| --- | --- | --- | --- |
| 01-three-years.jpg | 1920×1080 | 82628 | 615783db0a05f2d0adc225452579232106c05be7dda3eccd73450395e0f5c435 |
| 02-same-day-records.jpg | 1920×1080 | 91717 | 023ab145848e2b5ca54b465168d6ead7f36275c9021859b3f440d3cd5bb48323 |
| 03-mobile.jpg | 390×844 | 25095 | 4493005baa1c34ce87b178a8370abb1985b0016b743627db926eed6206a20529 |
| 04-two-line-direction.jpg | 1920×1080 | 78633 | 8f219a8f599b79f40c383475bbc267bfe439a75480d4ebd597ab3da54bd6fc9c |

## 遠端檢查與發布

PR [#431](https://github.com/simonliu1118-byte/chihyuan-web/pull/431) 已建立；CI／合併SHA與受控部署／正式健康檢查證據待填。未以PR裡跳過的deploy job當作發布成功。

## 本輪文件校正

- 瀏覽器截圖回傳實際為JPEG，原先檔名誤用PNG、尺寸誤按PNG header讀取；已按JPEG實際格式改為.jpg並重新解析SOF尺寸，bytes與SHA-256不變。此提交只有證據文件及檔名，無產品source變動。

## Claude審查

- 待Claude依正式契約、PR差異、此交接及CI複審；請檢查跨月歸位、同日多筆、舊無日期、備份0052、權限／版本guard、D1查詢及手機固定欄。
- 尚無Claude通過結論；GPT不代填。
