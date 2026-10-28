# 新工作交接入口

本目錄供**接下來新開的、仍在進行的跨對話／跨執行者工作**寫 handoff。舊的已結案交接文件已於 2026-10-28 經整理後移出主線，不需要持續追加到舊檔。

目前應依下列文件處理，而不是沿用過時交接：

- **叫貨功能／流程**：[ORDERING_MODULE.md](../architecture/ORDERING_MODULE.md)
- **ERP 查詢與 CYERPAutoQuery 介接**：[ERP_ITEM_QUERY_BRIDGE_CONTRACT.md](../architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md)
- **當前狀態與未完成事項**：[根 TODO](../../TODO.md)
- **已完成版本、歷史問題與驗證**：[根 CHANGELOG](../../CHANGELOG.md)
- **已結案工作單的 GPT 完成與 Claude 審查原文**：[2026-10-28 前的工作單固定快照](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/development/work-orders)（§8／§9 由 Git 歷史保留，不占用現行文件目錄）
- **未來新工作單的流程與模板**：[工作單 README](../development/work-orders/README.md)（尚未結案的工作單持續留在目錄中）
- **已結案舊 handoff 原文與舊版截圖**：在 Git 版本歷史仍可存取，參考 [2026-10-28 清理前固定快照](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/handoff)；此為歷史資料，不作現行規格依據。

後續新工作如需交接，另建新檔並記錄該工作實際進度、驗收與剩餘事項。正式功能完成後，仍以對應架構契約、CHANGELOG 與 TODO 為準；此目錄不成為平行契約或永久規則。

## 目前待 Claude 審查

- [WO-0.9.52 門市庫存盤點第一階段—交 Claude 最終審查](CYWEB-WO-0.9.52-STOCKTAKE-CLAUDE-REVIEW.md) — PR #307，399/399 完整 Node、Local D1、七張真 Chromium 合成 UI 截圖已通過；外部真 D1／ERP 限制詳見 handoff §5／§8。未合併未部署。

- [CYWEB V0.9.49：季度隔離還原及超管主動提醒](CYWEB-V0.9.49-QUARTERLY-REHEARSAL-CLAUDE-REVIEW.md) — 功能分支 `feat/cyweb-quarterly-rehearsal-20261028`，含逐檔變更、站內提醒、回歸測試、未完成的物理 D1 解綁風險及 Claude 最終審查欄位。


## 歷史已合併交接

- [CYWEB V0.9.48：隔離還原診斷與驗證紀錄](CYWEB-V0.9.48-REHEARSAL-CLAUDE-REVIEW.md) — PR #300，包含變更清單、測試／CI、Cloudflare 唯讀診斷摘要、風險與 Claude 最終審查欄位。

CYWEB GPT／ChatGPT 每項修正依已合併的 `PROJECT_RULES.md` §9.1，須在同分支 handoff 完整記錄並交 Claude 審查；Claude 通過後，合併與正式部署仍須按使用者授權執行。
