# CYWEB V0.19.0 商品毛利第一階段交接

- 日期：2026-11-14（台灣）。
- 狀態：工程完成、待 Claude 審查；桌機／手機目視截圖尚待完成；未合併、未部署。
- 分支：`cyweb/item-margin-phase1-20261114`。
- 基準：main `d1407054310d65c7cf7543153d026c3b6a84aa16`；承接規劃 PR #513 的提交 `2681b7b5bcfb156abbeb1682c3dfa74ec903dc40`，未合併任何 PR。
- VERSION／package：0.19.0，BUILD 0。新增完整非網路通路毛利能力，Minor 升級；非同項返修，不使用 Build1。
- 計畫：[ITEM_MARGIN_PLAN.md](../development/ITEM_MARGIN_PLAN.md)；原規劃交接：[planning handoff](CYWEB-ITEM-MARGIN-PLAN-20261114.md)。

## 1. 使用者要求與範圍

「先做第一階段，不要合併及部署」。每次變更都寫 handoff 交 Claude 審查，不能套用先前其他 UI 可先部署的授權。

成本稅別直接改商品主檔三選一：含稅／未稅（外加）／不計稅，必填、無預設。成本、稅別、門市／診所／批發售價只由主檔提供；毛利頁不另填、不覆寫。第二階段才處理全部網路基本毛利、優惠、費率、區間與 AI。使用者追問「商品詳情」時已澄清：指現有選定商品後的資料區，沒有新增或重做另一個商品詳情頁；本版只增加毛利分析頁與原商品資料切換。

## 2. 修改檔案與責任

| 檔案 | 原因／行為 |
| --- | --- |
| shared/item.ts | 新的三種有效成本稅別；讀取保留 NULL 待補 |
| shared/item-margin.ts | 唯讀結果型別，分開付款／進項稅／淨成本與各解讀毛利，金額採字串 |
| worker/item/item-validation.ts | 新建／更新稅別必填，拒絕空值、舊 none 及其他碼；不把成本金額額外改必填 |
| worker/item/item-repository.ts | 稅別型別同步；延用現有商品 aggregate 讀取，不複製售價主檔 |
| worker/item/item-margin-service.ts | 唯一 Worker 毛利核心，BigInt 精確分數，既有 unitFactorToBase，最後才舍入；沒有 DB 寫入或網路毛利 |
| worker/item/item-service.ts | 以既有 getDetail 讀取已儲存主檔後計算，不接收替代成本／售價 |
| worker/item/item-persistence.ts | 成本與稅別 Audit；更新先鎖 revision 緊接 changes() 檢查，再改換算／價格子表及 Audit，競爭失敗整批回滾後 409 |
| worker/http/business-api-routes.ts | 增加 GET /api/business/items/:id/margin，原 ITEMS／CYID 授權不變 |
| src/runtime/api/item-runtime-client.ts | 唯讀查詢傳輸，不含前端計算或寫入 |
| src/runtime/modules/ItemOperationalPage.tsx | 現有商品資料／毛利分析切換，保留頂層商品／瑕疵與現有資料頁；待補稅別啟停時導回既有編輯；不在未儲存編輯時切分析頁 |
| src/runtime/modules/item/ItemSheet.tsx | 三種成本稅別共用必填欄位、無預設、舊 NULL 顯示待補；其他主檔欄位及網路價格編輯保留 |
| src/runtime/modules/item/ItemMarginPanel.tsx | RecordSheet 成本摘要、共用 cy-op-table cy-rt 通路表、淨收入／毛利額／率、共用 StatusChip／Loading／Feedback；非自行做桌機手機兩套 renderer，取消舊請求避免覆蓋新結果 |
| migrations/0069_item_cost_tax_modes.sql | rename/add/copy/drop column 更換 CHECK，舊 none 轉 NULL，inclusive／exclusive 原值，新增明確 no_tax；不 DROP items 親表或子表 |
| worker/backup/portable-backup.ts | marker0069；舊備份 none 升級 NULL，新 no_tax 往返保留；不修改備份欄位名稱或指紋驗證 |
| worker/acceptance/business-http-acceptance.ts | 合成商品更新為新明確稅別 |
| worker/acceptance/d1-local-acceptance.ts | 合成 SQL／service 商品使用新明確稅別，保留所有既有驗收 |
| scripts/item-margin.test.mjs | 真實 SQLite＋HTTP 驗證核心、權限、必填、忽略替代價格、revision／Audit、參照與備份 |
| scripts/item-margin-ui.test.mjs | React 結果 owner 的延遲回應隔離／revision 重讀、主檔稅別三選一及唯讀分析欄位；不是瀏覽器截圖 |
| scripts/item-price-record-sheet.test.mjs | 原 marker 斷言隨新 migration 更新，其餘既有斷言保留 |
| VERSION、package.json | 同步0.19.0，BUILD維持0 |
| docs/architecture/ITEM_MODULE_CONTRACT.md | 回寫成本稅別、計算與頁面／權限語意 |
| docs/architecture/FINAL_DATA_DICTIONARY.md | 新三碼及 NULL 只容納舊待補資料 |
| docs/architecture/API_CONTRACT.md | 唯讀查詢、回應型別、權限與不可覆寫的來源界線 |
| docs/architecture/BACKUP_ARCHITECTURE.md | none 升級、marker 與未來回退限制 |
| docs/development/ITEM_MARGIN_PLAN.md | 第一階段工程狀態／剩餘目視驗收，第二階段仍未做 |
| TODO.md、CHANGELOG.md | 第一階段待審／未合併部署與版本摘要，不重整無關舊待辦 |
| docs/handoff/README.md | 加入本輪交接入口 |
| docs/handoff/CYWEB-ITEM-MARGIN-PHASE1-20261114.md | 本交接，每輪返修與證據同步於此，Claude結論不代填 |

本分支承接 #513 的兩份新規劃／交接檔及 TODO／handoff 索引變更；原規劃 handoff 保留當時紀錄，本交接記錄後續工程變更。沒有修改永久規則、CI workflow、共用驗證門檻、ERP、正式憑證或任何正式資料。

## 3. 計算與真實資料缺漏

- 基準單位成本依三稅別轉淨額；付款與計算成本分開。5% 與可扣抵為使用者提供的一般情境前提，不宣稱特殊進貨也可套用。
- 門市含稅價×100/105；診所／每個批發單位以同一主檔價分別當未稅、含稅。成本先按精確換算倍率轉到相同銷售單位。
- 毛利額＝未稅銷售額－淨成本；比率以未稅銷售額為分母。金額、百分比最後輸出兩位小數，半數遠離零，沒有先將成本舍入後再算。
- NULL 成本／稅別不猜；某列缺售價或單位換算無效不阻斷其他列。售價零的比率 NULL、毛利額仍可負，成本零正常算。負值保留並標危險色。
- 舊 none 不代表明確 no_tax；migration 與備份皆轉待補 NULL。DB 必須允許 NULL 保留舊資料，Worker 新建／更新一定要求明確選擇。

## 4. Owner／複雜度與讀寫成本

| 項目 | Owner |
| --- | --- |
| 商品與編輯草稿／保存 | 原 ItemOperationalPage → ItemService／ItemPersistence，不新增草稿存放處 |
| 派生計算 | 唯一 Worker item-margin-service，前端只顯示 |
| 分析請求生命週期 | ItemMarginPanel effect，切商品／revision 或離開時取消舊結果；無 observer／背景輪詢／重試層 |
| 呈現 | 原 RecordSheet 與同一通路表；裝置差異由既有820px共享CSS處理 |
| 授權／Audit | 原 CYID／ITEMS gate 與 Audit Core，無新身分或 AI token |

一次分析使用既有 getDetail 的單一 D1 batch，4 個 SELECT（商品1列、同 item_id 換算、批發價、既有網路價），最後不計算也不回傳網路毛利。均使用主鍵或既有 item_id 索引，沒有全商品重算、無平台逐項掃描、正式零寫入；延用 aggregate 以維持一致快照，不另開一套價格 reader。商品更新新增1個成本／稅別前值查詢與真正有變更時的 Audit，不增加背景工作。

**正式資料讀取0、寫入0，尚未量測正式N列。** 0069會掃描並更新items全體N列，DROP COLUMN亦有內部表重寫成本，不能只報none的U列。發布前須在具體授權下確認N、容量／當期用量、備份及維護窗口；若超出合理額度，先改分段遷移方案並重新審查，不直接跑本SQL。這輪只在隔離合成資料驗證，無正式schema或費用支出作業。

## 5. 驗證證據

- `npm run typecheck`：前端／Worker通過。
- `npm run validate:source`：通過，包含schema、共用表單必填／Enter及既有來源契約。
- `npm run build`：通過。保留既有大bundle警告，沒有藉此改無關架構。
- `node --test scripts/*.test.mjs`：838項全數通過、0失敗；新增核心5組與UI2組，原有測試均保留。
- `npm run validate:d1:local`：70份migration、19組Worker＋D1驗收通過（含原子回滾、權限、單位、備份隔離還原）。
- 本機容器原生網路介面列舉失敗（uv_interface_addresses），在scratch以NODE_OPTIONS預載僅供隔離loopback測試的介面代用後完成D1／build；沒有將代用碼加入repo或產品。GitHub原生runner檢查仍是正式遠端驗證。
- 數值涵蓋成本100三稅別的付款／稅／淨額、門市210＝50%、診所180雙解讀44.44／41.67%、批發160＝37.50／34.38%、盒6個／1260＝52.38／50%、含稅成本100售價100精確零毛利、零價／零成本／負毛利／缺換算／舊鏈式。
- 真實HTTP／SQLite檢查缺稅別422、GET忽略query替代成本與價格、無session401、僅DEFECTS403、舊revision409與整批資料不變、成本稅別Audit、明確新稅別及舊備份往返；遷移保留子表價格／換算、索引／trigger、foreign_key_check。
- **目視限制**：1440／390瀏覽器截圖未完成。Playwright預設瀏覽器不存在且下載不完整，改用已安裝Chromium仍因容器禁止Unix socket無法啟動。沒有放寬環境限制，也沒有把React結構測試冒稱實際瀏覽器／正式登入驗收。臨時fixture頁／截圖腳本只在ignored scratch，未納入repo或新增一次性CI。

## 6. 待 Claude 審查與未完成驗收

- [ ] 核對三稅別、舊none／NULL、遷移與備份語意，以及任一 profile 更新必填。
- [ ] 核對BigInt算式、最後舍入、批發單位、零／負／缺資料。
- [ ] 核對ITEMS授權、唯讀API不接受價格覆寫、商品寫入revision與Audit原子性。
- [ ] 在可用瀏覽器補1440／390截圖：正常表、待補稅別、不同批發單位與缺換算、負毛利、三選一編輯；實測Enter及手機無整頁溢出，與現有商品／叫貨表格對照。
- [ ] 核對共用UI、舊請求隔離、保存後重算、編輯期間不丟草稿、原商品／瑕疵／網路價格流程不變。
- [ ] 遠端PR Runtime／Governance／部署契約CI通過；CI部署工作只驗契約，不能實際部署。
- [ ] 正式列數、額度、備份與正式登入驗收須在未來具體發布指示下另處理，這輪不得執行。

## 7. Claude 審查欄（僅由 Claude 填寫）

- 結論：待審查，不能把CI成功視為審查通過。
- 日期／審查者：待填。
- 必修項／意見：待填。
- 審查者直接修正小項：待填。
- 執行者仍不得自行合併／部署；任何返修在同分支更新本檔及PR。
