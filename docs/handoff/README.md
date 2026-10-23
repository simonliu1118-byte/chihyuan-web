# CY Web 交接與歷史證據索引

更新：2026-10-23。此文件只協助 **GPT → Claude／其他對話** 定位已存在的交接證據，不新增流程或治理規則，也**不是另一份目前進度表**。最新功能／未完成事項只看根目錄 [TODO](../../TODO.md)，正式產品行為以 current code、Business Decisions 與 canonical contract 為準。PR、部署的即時狀態必須在 GitHub 再次核對。

## GPT 工作單 → Claude 審查

本 repo 遵循 [REPOSITORY_RULES §11.4](../../REPOSITORY_RULES.md)；使用者委託 Claude 開立工作單後由 GPT 實作、寫入 **同一工作單 §8 完成報告**，Claude 在 **§9** 留審查結論。以下 PR 截至 2026-10-23 均已合併；工作單中的「尚未合併／待驗證」若位於 §0／§8，是**交付當時歷史狀態**，不得解讀為今日待處理。

| 工作單（§8 完成報告、§9 審查） | 工作 | PR | 2026-10-23 狀態 |
| --- | --- | --- | --- |
| [WO-0.9.12](../development/work-orders/WO-0.9.12.md) | 客戶紀錄卡片／共用介面 | [#207](https://github.com/simonliu1118-byte/chihyuan-web/pull/207) | 已審查、已合併 |
| [WO-0.9.13](../development/work-orders/WO-0.9.13.md) | 異動紀錄／人名與工具 | [#208](https://github.com/simonliu1118-byte/chihyuan-web/pull/208) | 已審查、已合併 |
| [WO-0.9.14](../development/work-orders/WO-0.9.14.md) | 客戶編號／多品項報價 | [#212](https://github.com/simonliu1118-byte/chihyuan-web/pull/212) | 已審查、已合併 |
| [WO-0.9.15](../development/work-orders/WO-0.9.15.md) | 商品頁／換算與相關紀錄 | [#214](https://github.com/simonliu1118-byte/chihyuan-web/pull/214) | 已審查、已合併 |
| [WO-0.9.16](../development/work-orders/WO-0.9.16.md) | 導覽與稽核介面細修 | [#216](https://github.com/simonliu1118-byte/chihyuan-web/pull/216) | 已審查、已合併 |
| [WO-0.9.18](../development/work-orders/WO-0.9.18.md) | 我的帳號／說明文字（發布版 0.9.19） | [#220](https://github.com/simonliu1118-byte/chihyuan-web/pull/220) | 已審查、已合併 |
| [WO-0.9.20](../development/work-orders/WO-0.9.20.md) | 人事第一期 | [#221](https://github.com/simonliu1118-byte/chihyuan-web/pull/221) | 已審查、已合併 |
| [WO-0.9.21](../development/work-orders/WO-0.9.21.md) | Cloudflare 用量巡檢 | [#225](https://github.com/simonliu1118-byte/chihyuan-web/pull/225) | 已審查、已合併 |
| [WO-0.9.24](../development/work-orders/WO-0.9.24.md) | 人事第二期 2a | [#245](https://github.com/simonliu1118-byte/chihyuan-web/pull/245) | 已審查、已合併 |
| [WO-0.9.25](../development/work-orders/WO-0.9.25.md) | 人事第二期 2b | [#249](https://github.com/simonliu1118-byte/chihyuan-web/pull/249) | 已審查、已合併 |
| [WO-0.9.26](../development/work-orders/WO-0.9.26.md) | 叫貨模組 | [#253](https://github.com/simonliu1118-byte/chihyuan-web/pull/253) | 已審查、已合併 |
| [WO-0.9.27](../development/work-orders/WO-0.9.27.md) | 共用表單欄位 | [#258](https://github.com/simonliu1118-byte/chihyuan-web/pull/258) | 已審查、已合併 |

未經正式驗收或仍待定案的後續工作不應因上表「已合併」而自動結案；以 [TODO](../../TODO.md) 的未勾選項目及已確認 Business Decisions 為準。

## GPT 直接修正與跨工作線交接

以下是**既有文件的入口**；交接與修復的證據在原檔及 PR，不為每個 PR 另造一份 handoff。

| 領域 | 原始交接／回報 | 對照的 PR／結果 |
| --- | --- | --- |
| 叫貨自動儲存、鍵盤、表格、到貨、D1 GLOB 錯誤、Cloudflare Logs | [CYWEB_ORDERING_AUTOSAVE_HANDOFF.md](CYWEB_ORDERING_AUTOSAVE_HANDOFF.md) | [#260](https://github.com/simonliu1118-byte/chihyuan-web/pull/260)、[#262](https://github.com/simonliu1118-byte/chihyuan-web/pull/262)、[#265](https://github.com/simonliu1118-byte/chihyuan-web/pull/265)、[#267](https://github.com/simonliu1118-byte/chihyuan-web/pull/267)、[#269](https://github.com/simonliu1118-byte/chihyuan-web/pull/269)、[部署驗收 #270](https://github.com/simonliu1118-byte/chihyuan-web/pull/270)、[表格 #271](https://github.com/simonliu1118-byte/chihyuan-web/pull/271)、[發布交接 #272](https://github.com/simonliu1118-byte/chihyuan-web/pull/272) |
| 未合併 Draft PR 清理（一次性稽核） | [CYWEB_OPEN_PR_CLEANUP_REPORT.md](CYWEB_OPEN_PR_CLEANUP_REPORT.md) | [#268](https://github.com/simonliu1118-byte/chihyuan-web/pull/268)；數量與 Open 狀態是當日快照，不是目前 PR 清單 |
| ERP Bridge 初始協作 | [需求 handoff](ERP_ITEM_QUERY_BRIDGE_HANDOFF.md)／[交回報告](ERP_ITEM_QUERY_BRIDGE_REPORT.md) | 原需求為跨 repo 歷史輸入；現行契約參考 [ERP Item Bridge Contract](../architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md) |
| ERP INVQ01 與歷史異動 | [補充 handoff](ERP_ITEM_QUERY_INVQ01_HANDOFF.md)／[交回報告](ERP_ITEM_QUERY_INVQ01_REPORT.md) | 已整併到同一現行契約；不要以舊交接覆蓋新契約 |
| ERP 品名搜尋 | [補充 handoff](ERP_ITEM_NAME_SEARCH_HANDOFF.md)／[交回報告](ERP_ITEM_NAME_SEARCH_REPORT.md) | 已整併到同一現行契約 |
| ERP 查詢 UI／共用頁首 | [ERP_ITEM_QUERY_UI_SHELL_REPORT.md](ERP_ITEM_QUERY_UI_SHELL_REPORT.md) | 歷史回報，現行 UI 以主線程式為準 |

一般直接改動如 [價格觀測室原型外連 #150](https://github.com/simonliu1118-byte/chihyuan-web/pull/150) 有 PR／TODO 紀錄，但不是「Claude 開單→GPT 接手」的工單；**依使用者要求，不追補獨立 handoff**。

## 閱讀與整理原則（僅說明本次文件歸檔）

- **保留原文、不重寫**：所有工作單 §8/§9、GPT→Claude handoff、跨 repo 交回報告、PR／CI／部署證據，以及原先未通過測試的真實限制。
- **修正導覽用當前狀態**：工作單頁首寫截至 2026-10-23 已審查／PR 已合併；實作當時的「不能合併／待部署」保留在原始紀錄，並明確標記歷史語境。
- **TODO 2026-10-23 重新排序／去重**：根 [TODO](../../TODO.md) 已將原來 74 條普通＋3 條編號未勾選標記整併成 27 條依相依順序排列的工作，另列 5 組歷史註記。每條都附來源舊編號，完整原文與逐條編號保存於 [整理前快照](../development/TODO_BEFORE_TRIAGE_2026-10-23.md)；這是分類，不代表未列的原始標記都已驗收完成。
- **已結案的過期 TODO 快照**：另在 [已結案歷史快照](../development/TODO_COMPLETED_2026-10-23.md) 保存，避免舊「目前／最新」覆蓋現況；未完成工作以根 TODO 的合併清單為準。
- **避免重複規則與進度**：本索引只是連結導航；不複製工作單的操作細節、不修改現行 Business Decision、正式部署或產品版本。

