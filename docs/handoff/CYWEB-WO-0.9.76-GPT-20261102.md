# WO-0.9.76 Claude 交接（2026-11-02）

- 分支：cyweb/wo-0.9.76-restock-layout；PR [#365](https://github.com/simonliu1118-byte/chihyuan-web/pull/365)；版本V0.9.79 Build0。
- 需求與逐項完成報告：[WO-0.9.76](../development/work-orders/WO-0.9.76.md) §8；Claude審查請回填原工單§9，本文件不代填通過。

## 修改與原因

| 檔案 | 最終行為／原因 |
| --- | --- |
| src/runtime/modules/RestockAssist.tsx | 總計預設、每日明細受控偏好、共用CheckField/IconButton、單一scroll內容與footer；保留last-source預選，移除僅供建議組的多餘state；所有API與查詢邏輯維持原路徑。 |
| src/runtime/modules/erp-item-query.css | 780/1100內容寬、唯一捲動、單一sticky thead與左欄、固定footer、390卡片與加入對話框密度。移除原72vh與表格overflow，沒有CSS疊補新owner。 |
| src/ui/OrderingSourceChips.tsx、ordering-source-chips.css | 移除建議／上次重複標籤組與專用props/state；公司／廠商與草稿圓點維持，廠商列表約五行。 |
| scripts/validate_operational_runtime.py | 只承認工單明定的單一畫面偏好鍵，業務localStorage檢查維持。 |
| scripts/restock-layout.test.mjs | 只驗收工單主要三個案例：總計／每日、偏好／compact、上次預選及無建議，並檢查沒有改回全品號預查。 |
| VERSION、package.json、TODO、CHANGELOG、ORDERING_MODULE、工單 | 版本與正式規格／驗收狀態同步。 |

## Owner 與範圍

前後都是OrderingRestockDrawer/useErpJob → RestockAssist → RestockTable/AddToOrdering單一路徑。只將每日偏好和Feedback提升到RestockAssist以提供footer位置，篩選／排序／開啟狀態仍由原Table持有；手機只用同一DOM的CSS presentation與既有useCompactLayout。未新增observer/retry/wrapper/第二表頭或renderer，不改共用SidePanel。唯一scroll owner的細節與理由見工單§8。

## 驗證、風險與交付

- **交付**：V0.9.79 Build0，PR [#365](https://github.com/simonliu1118-byte/chihyuan-web/pull/365)，分支 cyweb/wo-0.9.76-restock-layout。已整合 main 2f9e9f8，保留Claude已合併的V0.9.76到貨／日期、V0.9.77未到貨頁籤、V0.9.78草稿紅框／手填廠商值。版本依工單順延，未覆蓋其他工作。
- **桌面預設**：1440×900，340個合成品號；抽屜寬780px，內容scrollWidth=clientWidth=763，沒有水平溢出，只有cy-restock-content一層上下捲動。表頭固定在內容頂端。
- **每日明細**：共用CheckField與庫存不足並排，切換後抽屜1100px，才產生每日欄位；同一內容區可水平捲動，單一thead固定top:0，品號固定left。重新整理後記得偏好。無額外API讀取。
- **加入與提示**：共用IconButton＋Icons.add（table），aria-label/title「加入叫貨單」。FeedbackBanner為捲動內容外的flex footer，加入成功後即使表格很長仍在底部可見。
- **來源視窗**：移除建議組，保留公司／廠商、上次來源預選及草稿圓點；仍只在打開時查該品號draft-items。80個合成廠商下列表174px約五行；1440×900的440×572px視窗只有廠商列表捲動，視窗本身不捲。
- **手機**：390×844，抽屜寬390且無水平溢出；同一tbody/tr用data-label卡片顯示，右上加入圖示；不產生每日欄、隱藏明細切換。370px加入視窗亦只有廠商列表捲動。
- **本機驗證**：V0.9.79的npm run typecheck／build／validate:source通過；整合後叫貨grid/page/route與本工單、共用欄位／鍵盤測試 **104/104** 通過。為執行完整來源檢查，在ignored .tmp使用Python官方3.13.0攜帶版（Authenticode Python Software Foundation簽章Valid）、僅程序環境PYTHONUTF8=1，未改系統安裝。
- **本機平台差異**：前兩次完整Node在Windows為582/571、587/576，11失敗皆為未修改的Windows URL／CRLF／schema換行指紋；Linux完整結果如下。npm run validate:d1:local已完成全部migration、Worker+D1 acceptance及移除舊session表三項PASS，退出清理時遇Windows WinError32檔案占用；已停止該隔離驗證背景程序，沒有把此命令的整體退出碼記成成功。Linux CI的同命令整體通過。
- **正式CI**：程式整合提交65d8fdc的[Runtime Check 41449692020](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41449692020)四jobs全綠，完整Node **596/596通過、0失敗**，含Local D1、來源契約及build；[Governance](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41449692094)及[部署契約](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41449692026)通過。最後僅回填本報告／交接，交審時仍確認[PR最新head checks](https://github.com/simonliu1118-byte/chihyuan-web/pull/365/checks)全綠後再轉Ready。
- **截圖交付**：外部outputs/WO-0.9.76-ui-proof.zip，包含wo76-desktop-compact、desktop-daily、desktop-daily-sticky、desktop-add、desktop-footer、mobile-cards、mobile-add七張PNG，全部合成資料，未放入Public Git。
- **偏離及原因**：水平與上下捲動共用抽屜內容區，避免table wrapper的overflow-x:auto建立另一個scroll ancestor、使表頭無法相對抽屜固定。沒有複製表頭／observer／DOM relocation／第二套手機元件，SidePanel共用元件未改。
- **來源檢查修正**：原validate_operational_runtime.py全面拒絕localStorage，誤判工單指定的畫面偏好。直接修改既有檢查，只允許RestockAssist的cy-restock-daily兩個literal存取；其他業務儲存仍禁止，未新增儲存wrapper。
- **資源與審查**：本輪正式D1讀0列／寫0列、正式ERP呼叫0；合成HTTP及本機D1均不接正式服務。相對最新main沒有API／Worker／migration變更。Claude最終審查請填原工單§9；未合併、未部署、未發Release。
