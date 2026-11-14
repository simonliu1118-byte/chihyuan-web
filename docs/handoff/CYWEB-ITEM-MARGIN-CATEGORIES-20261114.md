# CYWEB V0.20.1 蝦皮／Mo+品類費率交接

- 日期：2026-11-14（台灣）。新增獨立品類需求，依Patch升V0.20.1，Build0；不是0.20.0原要求返修。
- 分支：`cyweb/item-margin-phase2-design-20261114`，接續PR #515。父commit：cfa9d01b56d1b770219ac9663cf73b070df03270。
- 基準：PR #515尚未合併，main仍d1407054310d65c7cf7543153d026c3b6a84aa16；包含未合併PR #514的第一階段，未變更其分支。
- 狀態：工程與本機自動驗證完成，待Claude審查與實際桌機／手機目視；未合併／未部署，正式D1讀0／寫0，遠端migration0。
- 依同工作階段已讀治理／Business Decisions／主檔與共用UI規格；未改治理、部署workflow或永久權限。使用者每次新增／更正均整合於本交接，不代填Claude通過。

## 使用者定案與實際行為

1. 基本費率增品類費率。**蝦皮與Mo+分開設定**，各自有品類名稱及對應費率；同名也不共用。
2. 商品詳情RecordSheet新增「蝦皮品類」「Mo+品類」下拉，均選填、無預選。選項只列對應平台已保存的品類費率；未設定則停用下拉並提示先設定，不接受自由填名稱。
3. 選中品類費率加入該平台基本費率，因此基本、基本＋活動兩欄及所有滿件／券區間都包含它；每商品每平台只套用一品類，不把所有品類相加。
4. **未選蝦皮只隱藏蝦皮毛利**，顯示「請先選擇品類」；Mo+同理。門市／診所／批發、另一平台及其他網路平台都不受影響，不清空商品成本或售價。
5. 商品一般分類與平台品類不同，不自動對應、不猜舊資料。品類改名或調費率保留穩定識別，既有商品不用重選；已使用品類不能直接移除，須先調整商品。

## 設定、資料權威與相容

現有平台設定選擇蝦平台時，基本費率下方增加「蝦皮品類費率」RecordRows；MO平台為「Mo+品類費率」。兩邊獨立新增／編輯／刪除，使用品類名稱、計算方式及數值、最低／最高收費，沒有增加日期、適用範圍、啟停或AI欄位。穩定字串id由UI產生、不給使用者編輯，API驗證唯一與格式。

平台身分沿用0061既有seed：蝦id1、MO id2；這兩個平台在現有設定只能改名／停用，名稱不是識別鍵。共用常數明文定義兩個商品欄位的對應，不用現在的字串名稱猜平台，也沒有重建或改名正式平台。若將來要改平台身分／新增第三個有品類欄位的平台，須另提需求。

規則JSON新增categoryFees，每平台最多100筆，費率及名稱以目前rules_json為唯一權威，完整歷史仍保留於rule_versions。0072新增：

- item_platform_fee_categories：僅(platform_id,category_id)鍵投影，供外鍵驗證，不重複存名稱／費率。
- item_platform_fee_selections：商品id＋平台id唯一，category_id複合外鍵指向對應平台品類；商品刪除時連動清理，品類有商品使用時禁止刪除。

規則current、鍵投影、完整版本與Audit在同一D1 batch，移除使用中品類回422且整批rollback，不留下新版號、歷史或Audit。舊revision409維持原行為。費率改名／改數值保留category_id，不搬商品。

商品選擇隨既有aggregate／revision保存，create可不選、PATCH省略欄位保留原選擇，空陣列明確清空；下拉清掉其中一平台時保留另一平台。前置驗證只允許已設定、對應平台、每平台一筆；資料庫外鍵補足並發移除的競態，失敗不留下部分商品異動。商品主檔成本／價格、稅別計算及其權限不變。

舊規則無categoryFees讀為空陣列，不寫回歷史。0070／0071舊備份新表為空，舊商品不猜品類、原費率完整保留；目前備份涵蓋四張規則／品類／關聯表。前端仍只讀Worker結果，不重做公式或第二份成本／價格。

## 權限及讀寫量

- 一般ITEMS可讀平台選項及編輯商品品類；既有`/items/platforms`只附feeCategories的id／name，SQL只投影這兩項，不回費率金額。
- 無ITEMS_COST_MARGIN仍成本／稅別空白，詳情不帶margin，不能讀規則或毛利接口，更不能修改費率。SUPER_ADMIN才能保存共享品類費率，沒有自動擴權。
- 既有platforms資料owner同一次lookup讀兩邊選項，不為每個下拉／品類發HTTP。平台資料一個SQL，JSON1投影已保存名稱；規則管理仍按平台讀寫。
- 商品詳情原D1 batch多一個選擇表SELECT，HTTP仍同次詳情；同一item快照供全部通路，不逐平台再讀商品。
- 商品寫入多一個有界查詢驗證選擇，最多2筆；既有原子batch內更新關聯，沒有背景重算或全商品寫入。
- 規則寫入多2個有界SQL（JSON1批次補品類鍵及刪已移除鍵），不是逐品類HTTP／D1迴圈。每類最多100品類，費目／券上限沿用前版。

## 逐檔變更

| 檔案 | 修改原因／行為 |
| --- | --- |
| VERSION、package.json | 新品類需求升0.20.1，BUILD既有0保留 |
| shared/item-platform-fee-categories.ts | 蝦／MO固定平台身分、商品欄名及選擇／選項型別 |
| shared/item.ts | 商品aggregate／輸入附選擇，平台lookup附僅id／name的選項 |
| shared/item-online-margin.ts | 規則categoryFees及單平台所選categoryFee結果型別 |
| migrations/0072_item_platform_fee_categories.sql | 鍵投影、商品選擇、複合外鍵及索引，沒有正式品類seed |
| worker/item/item-platform-margin-rules.ts | 獨立平台品類驗證，原子鍵投影／版本／Audit、使用中刪除422、舊JSON相容 |
| worker/item/item-validation.ts | 最多兩平台選填輸入，重複／跨平台／非法識別驗證，省略不清空 |
| worker/item/item-repository.ts | 同次商品batch取選擇；既有platforms只投影品類id／name |
| worker/item/item-persistence.ts | 選擇跟隨既有商品create／revision update batch，失敗全回滾 |
| worker/item/item-service.ts | 品類存在及平台對應前驗證，關聯並發變更回欄位錯誤 |
| worker/item/item-online-margin.ts | 所選品類加一次至基本費率，缺選擇僅中止該平台計算 |
| worker/backup/portable-backup.ts、schema-columns.ts | marker0072及兩表完整備份，舊包空表相容 |
| src/runtime/modules/item/ItemSheet.tsx | 共用RecordSheet兩個獨立選填下拉、未設定停用、互不覆寫 |
| src/runtime/modules/ItemOperationalPage.tsx | 單一draft owner帶入／保存平台品類，維持同次詳情與毛利 |
| src/runtime/modules/item/PlatformMarginSettings.tsx | 既有平台設定下各自品類RecordRows、穩定id、明示單一品類費率與平台隔離 |
| src/runtime/modules/item/OnlineMarginTables.tsx | 基本費率明細列所選品類；缺品類只顯示該平台提示、不繪其毛利表 |
| scripts/item-online-margin.test.mjs | 兩平台費率獨立、單一加計、缺品類局部隱藏、先設定才可選、身份／改名／刪除、權限、備份與舊0071／0070包 |
| scripts/item-margin-ui.test.mjs | 兩下拉選填／隔離／無設定停用，缺蝦皮不繪蝦皮表但Mo+仍繪表 |
| scripts/item-price-record-sheet.test.mjs、validate_schema.py | 0072 marker及新增兩表契約 |
| docs/development/ITEM_MARGIN_PHASE2_DESIGN.md | 同步使用者品類新需求與最後更正，維持其他網路規則 |
| docs/architecture/API_CONTRACT.md、ITEM_MODULE_CONTRACT.md | 既有API新增選項／選擇／categoryFee及局部隱藏、權限契約 |
| docs/architecture/FINAL_DATA_DICTIONARY.md、BACKUP_ARCHITECTURE.md | 0072兩表、唯一JSON權威及還原邊界 |
| docs/handoff/CYWEB-ITEM-MARGIN-CATEGORIES-20261114.md | 本輪全部新增／更正及逐檔修改、測試、限制，留Claude待審欄 |
| docs/handoff/CYWEB-ITEM-MARGIN-ONLINE-20261114.md、README.md | 前版指向新品類交接、開放審查入口 |
| TODO.md、CHANGELOG.md | 新版本未發布狀態及審查／目視待辦 |

## 本機驗證與證據

- `npm run typecheck`、`npm run build`、`npm run validate:source`通過；沿用scratch-only loopback shim處理本環境networkInterfaces限制，未提交shim或本機產物。
- `node --test scripts/*.test.mjs`：**851通過、0失敗**（前版847＋3組品類後端／計算＋1組下拉與局部隱藏）。
- 蝦皮2%／Mo+3%合成品類各自加入基本費率且只計一次，滿件／全券及兩費率欄仍正確；未選蝦皮僅其結果null／區間空，Mo+、其他平台及非網路毛利仍可算。
- 使用中品類刪除失敗，current revision、歷史與Audit筆數均不增加；改名／調費率維持商品原id；省略欄位不清空，過期商品revision409不動選擇；無效／跨平台品類422且不創建商品。
- 真SQLite HTTP的ITEMS-only可取兩欄id／name及選品類；不取得費率金額，cost／costTaxMode仍null、margin不回，規則403。原商品成本／售價未被品類操作覆寫。
- 新備份四表完整往返以主鍵排序核對（無ORDER BY的自然列序不是資料等價依據）；0071及0070舊包升級新表空、舊categoryFees讀空。
- 本機Wrangler完整**73個migration檔**及**19個Worker＋D1驗收群組**通過；`npm run validate:deploy`只是契約檢查，未執行部署。
- `git diff --check`與修改文件相對連結核對；GitHub提交前比較tree與本機index一致，遠端最新head CI以PR checks為準。

## 限制與Claude審查欄

- 實際1440／390目視仍待能啟動瀏覽器的環境完成（前版已記錄Chromium socket sandbox限制），不以元件測試冒充截圖。
- 未操作正式平台／品類／費率資料，沒有真正上線。既有0.20.0費率基礎、稅費及單件運費約定不變，沒有AI接口。
- Claude結論／日期：**待審查**。重點：兩平台資料隔離；未選只影響對應平台；普通ITEMS能選品類但不能得成本／費率；複合外鍵與原子刪除；舊備份；共用表單及手機選單。
- 執行者不得自行合併／部署，CI成功不代表Claude審查或發布授權。
