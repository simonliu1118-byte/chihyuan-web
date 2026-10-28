# 新工作交接入口

本目錄供**接下來新開的、仍在進行的跨對話／跨執行者工作**寫 handoff。舊的已結案交接文件已於 2026-10-28 經整理後移出主線，不需要持續追加到舊檔。

目前應依下列文件處理，而不是沿用過時交接：

- **叫貨功能／流程**：[ORDERING_MODULE.md](../architecture/ORDERING_MODULE.md)
- **ERP 查詢與 CYERPAutoQuery 介接**：[ERP_ITEM_QUERY_BRIDGE_CONTRACT.md](../architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md)
- **當前狀態與未完成事項**：[根 TODO](../../TODO.md)
- **已完成版本、歷史問題與驗證**：[根 CHANGELOG](../../CHANGELOG.md)
- **Claude → GPT 工作單完成與審查原文**：[工作單目錄](../development/work-orders/README.md)（§8／§9 保留）
- **已結案舊 handoff 原文與舊版截圖**：在 Git 版本歷史仍可存取，參考 [2026-10-28 清理前固定快照](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/handoff)；此為歷史資料，不作現行規格依據。

後續新工作如需交接，另建新檔並記錄該工作實際進度、驗收與剩餘事項。正式功能完成後，仍以對應架構契約、CHANGELOG 與 TODO 為準；此目錄不成為平行契約或永久規則。
