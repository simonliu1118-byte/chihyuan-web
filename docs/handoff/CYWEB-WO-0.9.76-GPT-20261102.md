# WO-0.9.76 Claude 交接（2026-11-02）

- 分支：cyweb/wo-0.9.76-restock-layout；PR待填；版本V0.9.77 Build0。
- 需求與逐項完成報告：[WO-0.9.76](../development/work-orders/WO-0.9.76.md) §8；Claude審查請回填原工單§9，本文件不代填通過。

## 修改與原因

| 檔案 | 最終行為／原因 |
| --- | --- |
| src/runtime/modules/RestockAssist.tsx | 總計預設、每日明細受控偏好、共用CheckField/IconButton、單一scroll內容與footer；保留last-source預選，移除僅供建議組的多餘state；所有API與查詢邏輯維持原路徑。 |
| src/runtime/modules/erp-item-query.css | 780/1100內容寬、唯一捲動、單一sticky thead與左欄、固定footer、390卡片與加入對話框密度。移除原72vh與表格overflow，沒有CSS疊補新owner。 |
| src/ui/OrderingSourceChips.tsx、ordering-source-chips.css | 移除建議／上次重複標籤組與專用props/state；公司／廠商與草稿圓點維持，廠商列表約五行。 |
| scripts/restock-layout.test.mjs | 只驗收工單主要三個案例：總計／每日、偏好／compact、上次預選及無建議，並檢查沒有改回全品號預查。 |
| VERSION、package.json、TODO、CHANGELOG、ORDERING_MODULE、工單 | 版本與正式規格／驗收狀態同步。 |

## Owner 與範圍

前後都是OrderingRestockDrawer/useErpJob → RestockAssist → RestockTable/AddToOrdering單一路徑。只將每日偏好和Feedback提升到RestockAssist以提供footer位置，篩選／排序／開啟狀態仍由原Table持有；手機只用同一DOM的CSS presentation與既有useCompactLayout。未新增observer/retry/wrapper/第二表頭或renderer，不改共用SidePanel。唯一scroll owner的細節與理由見工單§8。

## 驗證、風險與交付

- 實作版本：V0.9.77 Build0，基底 main 5c2a01c；WO-0.9.74 的到貨／日期改版另案審查，未混入本分支。
- 驗收：1440×900／340 個合成品號下抽屜 780px，內容 scrollWidth=clientWidth=763，只有 cy-restock-content 一層上下捲動；顯示每日明細後為 1100px，橫向與上下捲動均由同一內容區承擔，表頭 top=120 與內容頂端一致，固定品號 left=329 與內容左側一致。選擇重新整理後保留。
- 加入：共用 IconButton/Icons.add（table），FeedbackBanner 作為不捲動 footer，加入後位於視窗底部；公司／廠商僅出現一次，上次來源預選與草稿點保留。80 個合成廠商下列表高度 174px、可見約五行，440px 加入對話框高度約 572px，本身不需捲動。
- 手機390×844：抽屜寬390、內容無水平溢出、每日欄不建立／切換不顯示；同一表格轉 data-label 卡片，加入圖示在右上。手機加入對話框寬370，只有廠商列表捲動。
- 主要測試：新增 scripts/restock-layout.test.mjs 三項，實際測試預設／切換、偏好及 compact、來源預選與按需查詢；連同欄位／鍵盤測試6/6通過。npm run build（含前後端 typecheck）通過，既有 bundle 大小／dynamic import 警告未擴大處理。
- 本機完整 node --test scripts/*.test.mjs：582項571通過11失敗；失敗在未修改的 backup-rehearsal-http Windows URL、secure-entry Windows URL、部署檔CRLF及0043～0045 schema字元換行指紋。Windows未安裝Python，validate:source／validate:d1:local本機無法執行；需以PR的Linux CI執行正式完整驗證，不把本機結果寫成全通過。
- 截圖：外部交付 outputs/wo76-desktop-compact.png、wo76-desktop-daily.png、wo76-desktop-daily-sticky.png、wo76-desktop-add.png、wo76-desktop-footer.png、wo76-mobile-cards.png、wo76-mobile-add.png，全部是合成資料，未放入Public Git。
- 偏離說明：每日明細的水平捲動與上下捲動共用抽屜內容區；若給 table wrapper overflow-x:auto，瀏覽器會同時建立上下捲動 ancestor，使 sticky 表頭無法相對抽屜固定。因此直接維持一個 scroll owner，沒有複製表頭／observer／DOM relocation／第二套手機元件，符合單層捲動目的。SidePanel共用元件未修改。
- 資源：純前端；本輪正式D1讀0列／寫0列、正式ERP呼叫0。合成HTTP在localhost，不接正式服務，API/migration/Worker無變更。
- 最新head CI：待PR建立後回填。Claude最終審查待填；未合併、未部署、未發Release。

- 仍須Claude檢視本PR與工單，並由使用者依既有受控流程授權後續合併部署。沒有自行宣告審查通過。
