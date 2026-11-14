# CYWEB V0.20.0 商品網路毛利交接

- 日期：2026-11-14（台灣）。版本：V0.20.0 Build0；新增網路毛利及平台設定能力，依版本規則升 Minor。
- PR：#515；遠端分支 `cyweb/item-margin-phase2-design-20261114`，由原設計PR接續工程實作，base改為main供完整CI。
- 依賴：未合併 PR #514／33af48c48a31db0807732636f4afc873c4af1479。第一階段已包含在本分支，未對該分支另作修改。原設計父commit e3c5cfbcfe8b8f53ddc0193927efcb439564f077。
- 狀態：工程與本機自動驗證完成，待Claude審查；1440／390目視未完成。**未合併／未部署，沒有任何發布授權。**
- 規則基準：已讀根AGENTS列出的三層治理、architecture／decisions、TODO及相關商品／共用視覺來源；Common2.11.0、Governance1.1.29未修改。使用者本輪「所有修改寫handoff、交Claude審查、不合併部署」優先。
- [當前規格](../development/ITEM_MARGIN_PHASE2_DESIGN.md)；[第一階段交接](CYWEB-ITEM-MARGIN-PHASE1-20261114.md)。

## 需求與實際行為

使用者已授權第二階段，後續逐項簡化設定並提供三欄示意圖。商品詳情與毛利同頁，沒有新毛利主頁籤或額外查商品；瑕疵仍獨立。每個網路平台上方列基本／活動費目及扣費毛利、勾選運費及扣運費毛利；下方以「條件／基本費率／基本＋活動費率」同表比較。無折扣一列、實際設定的滿件折數各一列。

各列計算全部券，互斥券不能相加，每張各自與滿件折扣搭配。預設取全券整體最低／最高，展開逐券；最低及最高分行／分欄加粗金額與百分比，負值用既有危險色。UI僅顯示Worker結果，成本及售價完全來自主檔。

商品設定新增平台費用與優惠：基本／活動費率只有名稱、方式／數值、最低／最高；運費只有勾選、貨運別、金額；滿件只有件數、折數；券只有名稱、折數或金額、門檻、上限。沒有範圍、期間、啟停、提案或AI接口。設定明文說明券不可並用、與滿件並用，以及600／799比例區間。

## 計算決策與限制（Claude需特別核對）

- 對券門檻T至下一不同門檻U−1元比較，例如600折20、下一門檻800，在600與799計算折讓比；商品折抵＝折後商品含稅價×整單折抵／門檻端點。不計算客人如何湊單，不把滿件數當實際訂單量。
- 百分比券每端重新計算封頂。9折、滿600、上限20合法，600時折20。相同門檻券全部分別算，下一界取不同門檻。
- 最後固定／有上限券，折讓占比趨零為「理論上界」；有限訂單不保證可達。無上限折數券比例固定，不能用零折讓作上界。
- 各費目獨立：百分比用優惠後含稅商品價，固定費與勾選運費按單件扣。按輸入的賣家支出額扣除，沒有猜費用進項稅額。此簡化約定在設定畫面明示；並非自動辨識所有平台實際計費制度。
- 所有淨成本用第一階段同一`itemNetCost`，收入除1.05。費用後額與比例沿用單一Worker有理數核心，最後才舍入；區間比較精確折讓比，避免先舍入選錯極值。
- 沒有設定不能視為0：平台費率待設定。基本／活動各至少一費目，零費用須明確填0。缺成本／稅別不捏造毛利；零售價比例null、負值保留。
- 設定儲存即生效；這是人工Session設定API，不是AI委派接口。沒有真實平台費率查證、實際訂單或平台撥款對帳。

## 資料、權限與操作量

0071新增目前規則與歷史版本兩表，完整JSON快照依平台id存放，不重建商品價／成本。revision比較更新、歷史INSERT、Audit及changes()衝突斷言在同一D1 batch；任何過期revision回409並全部rollback。Audit只存前後revision，完整前後內容在版本表，操作者與時間分別保留。版本沒有可覆寫／刪除API。

閱讀要求ITEMS＋ITEMS_COST_MARGIN；只有商品權限仍成本／稅別留白、整個毛利區不掛載，API不回margin且規則／毛利403。共享設定PUT另限SUPER_ADMIN，沒有給USER／ADMIN加權。既有Session／CSRF／Worker權限流程沿用，不發憑證、不直接存取D1。

商品詳情原aggregate一次讀取，同一item快照供所有通路；有網路價時增加一個JSON1 IN規則查詢及一個平台名稱查詢，不逐平台／滿件／券查D1。歷史查詢維持既有責任，並非為毛利新增第二次商品詳情HTTP。每平台每類費目／滿件上限100筆，券500張；設定保存後既有event讓單一商品owner重讀。

保存已有規則：讀目前規則及平台驗證、讀Audit前版號，然後一批current／版本／Audit寫入；不全站重算、不排程、不逐商品寫毛利。當前完整備份包含兩表；0070舊備份升級補空表，不猜正式費率。正式D1讀0／寫0、遠端migration0、部署0。

## 逐檔變更

| 檔案 | 變更及原因 |
| --- | --- |
| VERSION、BUILD、package.json | 新能力0.20.0 Build0，無lockfile版本檔 |
| shared/item-online-margin.ts | 精簡平台費率／券／滿件規則，以及雙費率與逐券上下界結果型別 |
| shared/item.ts、shared/item-margin.ts | 商品詳情可附同次margin；margin可附online結果，型別import避免runtime循環 |
| worker/item/item-margin-service.ts | 匯出共用精確算術及itemNetCost，兩階段同成本／舍入核心 |
| worker/item/item-online-margin.ts | 兩費率、運費、滿件×全券、600／799、封頂及理論上界的唯一Worker運算 |
| worker/item/item-platform-margin-rules.ts | 規則白名單驗證、筆數界限、revision、版本及Audit原子保存 |
| worker/item/item-service.ts | 同item aggregate產出非網路與網路結果，沿用舊getMargin接口 |
| worker/http/business-api-routes.ts | 詳情附權威margin；手動規則GET／PUT，後端次級權限及SUPER_ADMIN邊界 |
| migrations/0071_item_platform_margin_rules.sql | 目前規則、不可覆寫版本兩表，無真實費率seed |
| worker/backup/portable-backup.ts、worker/backup/schema-columns.ts | CURRENT_MIGRATION0071、新兩表可攜備份及舊包相容 |
| src/runtime/api/item-runtime-client.ts | 共用transport取得／保存平台規則；沒有AI客戶端或直寫D1 |
| src/runtime/modules/ItemOperationalPage.tsx | 詳情及毛利同頁，移除子頁切換，設定保存刷新同一owner |
| src/runtime/modules/item/ItemMarginPanel.tsx | 純顯示父層同次結果，移除獨立毛利讀取，保留非網路表 |
| src/runtime/modules/item/OnlineMarginTables.tsx | 共用三欄比較表、運費結果、逐券展開、清楚最低／最高與負值樣式 |
| src/runtime/modules/item/PlatformMarginSettings.tsx | RecordRows／EntryFields／CheckField編輯，明示不可疊券及計算約定，保留未儲存保護 |
| src/runtime/modules/ModuleSettingsPanel.tsx、src/App.tsx | 既有商品設定入口及Dialog整合，僅SUPER_ADMIN有管理分頁 |
| src/runtime/modules/change-log-labels.ts | 新設定Audit的中文實體／動作名稱，避免泛用紀錄顯示英文碼 |
| scripts/item-online-margin.test.mjs | 公式邊界、全券／雙費率／運費、真SQLite權限與revision／歷史／備份／商品單次讀取 |
| scripts/item-margin-ui.test.mjs | 同次結果純閱讀、無第二次transport、共用矩陣與逐券最低／最高可讀性；保留成本遮蔽 |
| scripts/item-price-record-sheet.test.mjs、scripts/validate_schema.py | 新migration marker及兩表schema驗證 |
| docs/development/ITEM_MARGIN_PHASE2_DESIGN.md | 使用者最終簡化規格，取代未定案的複雜券／AI方案 |
| docs/development/ITEM_MARGIN_PLAN.md | 更新兩階段狀態及後續決策優先，AI延後，舊計畫標為追溯 |
| docs/handoff/CYWEB-ITEM-MARGIN-PHASE2-DESIGN-20261114.md | 舊設計交接轉指本工程交接，原文有固定Git快照 |
| docs/handoff/CYWEB-ITEM-MARGIN-ONLINE-20261114.md、docs/handoff/README.md | 本次完整交接及Claude待審入口 |
| docs/architecture/API_CONTRACT.md、ITEM_MODULE_CONTRACT.md | 同次詳情、手動設定權限與契約、同頁取代子頁規格 |
| docs/architecture/BACKUP_ARCHITECTURE.md、FINAL_DATA_DICTIONARY.md | 0071兩表、完整版本、備份欄位與舊包升級 |
| TODO.md、CHANGELOG.md | 未發布新能力與待審／目視限制，沒有冒稱已部署 |

## 驗證

- `npm run build`：通過（含兩份tsconfig typecheck及Vite）；既有大chunk提示保留。
- `npm run validate:source`：通過，含schema、共用表單及Audit中文標籤。
- `node --test scripts/*.test.mjs`：847通過、0失敗；其中新網路測試5組、UI新增矩陣組，第一階段權限與成本測試亦通過。
- 真SQLite HTTP測試涵蓋首次保存、成功revision1→2、過期版本409且版本／Audit不增加、舊JSON不可變、USER／ADMIN可讀但不可寫、撤成本權限403、詳情單一主檔查詢及成本／售價不變。
- 備份當前完整往返、0070舊包升級補空表；本機Wrangler完整72個migration檔及19個Worker＋D1驗收群組通過。
- `npm run validate:deploy`：僅部署契約檢查，不執行部署。
- `git diff --check`及文件相對連結核對；發佈source前核對GitHub tree與本機index完全一致。PR CI結果以GitHub最新head checks為準。
- 本環境networkInterfaces系統呼叫受限，build／Wrangler以scratch-only loopback shim補本機介面；不進產品source。完整回歸需的canonical CYAPPS測試來源僅作暫存依賴，不複製入repo。

## 未完成／Claude審查欄

- **1440／390實際瀏覽器目視待完成**：本環境Chromium啟動受Unix socket sandbox限制、Playwright browser下載不可用；不以元件測試冒充真實畫面驗收。需特別檢查平台設定大量券、巢狀逐券表手機換行、Dialog未儲存保護及零／負毛利。
- 未填入任何真實平台費率，尚無正式資料驗收。簡化費基／運費按單件／費用稅處理已明示；若實際平台不同，須另行需求處理，不能假裝本版可涵蓋。
- Claude結論／日期：**待審查**；需修正項目：待填。審查重點為需求欄位最小化、兩費率與全券極值、理論界、原子版本、權限撤回、備份相容及共用UI。
- 執行者不得自行合併／部署；此交接與PR是給Claude審查的具體成果，沒有對外發文、發送BOT訊息或宣稱Claude已通過。

網路費用後結果型別為`ContributionValue`（`contributionAmount`／`contributionMarginPercent`），與原商品基本毛利`MarginValue`（`grossProfit`／`grossMarginPercent`）明確區分，畫面仍以「毛利」方便閱讀；兩者共用同一精確計算核心。
