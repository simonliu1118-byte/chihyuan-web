# 新工作交接入口

本目錄只放**仍在進行或等待 Claude 審查**的交接（`PROJECT_RULES.md` §9.1）。審查通過、正式規格與 TODO／CHANGELOG 都同步後，交接就在文件整理 PR 移出主線；原文由 Git 固定快照保留，不改寫歷史。

現行規格與狀態請看：

- 當前狀態與未完成事項：[根 TODO](../../TODO.md)
- 已完成版本與驗證：[根 CHANGELOG](../../CHANGELOG.md)
- 架構與各模組契約：[architecture README](../architecture/README.md)
- 工作單流程與模板：[工作單 README](../development/work-orders/README.md)

## 目前待 Claude 審查

- [V0.12.4 Build 1 BOT 審核推播](CYWEB-BOT-REVIEW-PUSH-0124-20261108.md)：PR #449 已依本輪授權合併 main（4352a9f9），完整 CI 713/713 通過；**正式受控部署未觸發**，Claude 事後複審、0058 正式驗證與 Grok 實機啟用待辦。

- [V0.12.3 Build 1 BOT 獨立憑證、摘要及 Grok 工具](CYWEB-GROK-REPORTER-0123-20261107.md)：PR #447已依使用者本輪授權合併部署，發布#42391275622成功；0057原樣保留小編憑證、逐BOT隔離，健康／來源與HTTPS／session／排程／portal驗證通過。拍板結案不接後臺；Claude事後複審及新版UI／原key實機驗收待辦。推播在本輪發布交接完成後接續，尚未上線。

- [V0.12.2 BOT 工作總覽](CYWEB-BOT-OVERVIEW-0122-20261107.md)：PR #445 已依當次使用者授權合併部署，發布 #42371824288 成功；完整 CI、0056 索引、兩端健康與 HTTPS／排程／portal 檢查通過。待審共用表格每件一列、無展開。Claude 事後複審與正式 BOT 實機驗收仍待辦。

- [V0.12.1 盤點紀錄與 ERP 清除同步歸檔](CYWEB-STOCKTAKE-RECORDS-0121-20261107.md)：只合併部署 WEB，PR #443／發布 #42347693527 成功，migration 0055 及健康驗證通過；Claude 事後複審與實機驗收待辦。CYERPAutoQuery 只留專案需求 handoff，程式變更已撤回、不合併發行；舊 Agent 暫不觸發自動歸檔。

- [V0.12.0 Build 1 文件現況同步](CYWEB-DOCS-CURRENT-0120-20261107.md)：只更新文件與歸檔已完成的 WO-0.9.94 交接，不改產品／版本／部署；待 Claude 複審。

- [V0.12.0 Build 1 BOT 管理中心](CYWEB-BOT-CENTER-0120-20261106.md)：PR #438 已修正並行審稿及輪詢讀取，與 #440 一併合併部署成功（Run #42253210792）；Claude 事後複審及實機驗收待辦。

- [V0.11.6 盤點批號刪除圖示](CYWEB-STOCKTAKE-BATCH-DELETE-0116-20261106.md)：PR #440 已合併並隨 V0.12.0 Build 1 部署成功；CI／本機測試通過，Claude 事後複審及實機驗收待辦。

- [V0.11.5 ERP Session 無資料時隱藏查詢完成卡](CYWEB-ERP-SESSION-CLEARED-0115-20261106.md)：PR #439 已隨 V0.12.0 Build 1 正式部署，待 Claude 事後複審。

- [V0.11.4 出機類別、財產編號及維護浮窗](CYWEB-EQUIPMENT-CATEGORY-ASSETS-0114-20261106.md)：PR #437 已隨 V0.12.0 Build 1 正式部署，待 Claude 事後複審。

- [V0.11.3 ERP 未收款共用表格](CYWEB-ERP-RECEIVABLE-TABLE-0113-20261105.md)：PR #435 已合併部署，驗收／部署證據見 handoff，待 Claude 事後複審。

- [V0.11.2 出機表單與保固年月](CYWEB-EQUIPMENT-FORM-0112-20261105.md)：PR #433 已合併部署，驗收／部署證據見 handoff，待 Claude 事後複審。

- [V0.11.1 三年維護矩陣](CYWEB-MAINTENANCE-MATRIX-0111-20261105.md)：PR #431 已依使用者特例合併部署，完整CI／正式健康檢查通過，Claude待事後複審。

- [V0.11.0 出機與定期維護](CYWEB-EQUIPMENT-MAINTENANCE-0110-20261105.md)：PR #429，已依使用者本次特例合併部署，Claude待事後複審。

- [V0.10.25 售後維修清單微調](CYWEB-REPAIR-LIST-01025-20261105.md)：PR #427，已依使用者授權合併部署，Claude 待事後複審。

- [V0.10.24 門市步驟鎖定與物流顯示](CYWEB-WO-0.10.24-STEP-LOCK-20261104.md)：PR #426 已合併部署，待 Claude 事後複審與實機驗收。


- [V0.9.88 工作視窗明確關閉](CYWEB-DIALOG-EXPLICIT-CLOSE-0988-20261103.md)：PR #379，已合併部署，待 Claude 事後複審。
- [V0.9.87 客戶介面密度](CYWEB-CUSTOMER-DENSITY-0987-20261102.md)：PR #377，已合併部署，待 Claude 事後複審。

## 已結案交接的原文

| 整理日期 | 範圍 | 固定快照 |
| --- | --- | --- |
| 2026-11-07 | WO-0.9.94 兩段均已由 Claude 審查通過並完成合併；第二段正式版本 V0.10.12。當前結論見 [工單 §9](../development/work-orders/WO-0.9.94.md#9-審查紀錄審查者填)；[第一段原交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff/CYWEB-WO-0.9.94-GPT-20261103.md)、[第二段原交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff/CYWEB-WO-0.9.94-PHASE2-01011-20261104.md) | [固定快照 c870278](https://github.com/simonliu1118-byte/chihyuan-web/tree/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff) |
| 2026-11-03 | V0.9.48–V0.9.85 的交接（盤點、門市訂購／黑名單／月度待辦、備份、ERP 清理、治理 1.1.24、WO-0.9.68～0.9.76 執行交接） | [handoff @ 4cbc554](https://github.com/simonliu1118-byte/chihyuan-web/tree/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff) |
| 2026-10-28 | 更早的 GPT／Claude／ERP 交接與舊版截圖 | [handoff @ b2d53cd](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/handoff) |

這些原文只作追溯，不作現行規格依據。V0.9.56 Build 1～V0.9.64 的 Claude 事後審查結論在 2026-11-03 快照的 `CYWEB-CLAUDE-REVIEW-0956-0964-20261102.md`。
