# 新工作交接入口

本目錄只放**仍在進行或等待 Claude 審查**的交接（`PROJECT_RULES.md` §9.1）。審查通過、正式規格與 TODO／CHANGELOG 都同步後，交接就在文件整理 PR 移出主線；原文由 Git 固定快照保留，不改寫歷史。

現行規格與狀態請看：

- 當前狀態與未完成事項：[根 TODO](../../TODO.md)
- 已完成版本與驗證：[根 CHANGELOG](../../CHANGELOG.md)
- 架構與各模組契約：[architecture README](../architecture/README.md)
- 工作單流程與模板：[工作單 README](../development/work-orders/README.md)

## 目前待 Claude 審查

- [V0.10.25 售後維修清單微調](CYWEB-REPAIR-LIST-01025-20261105.md)：使用者授權合併部署，Claude 待事後複審。

- [V0.10.24 門市步驟鎖定與物流顯示](CYWEB-WO-0.10.24-STEP-LOCK-20261104.md)：待審查，未合併部署。

- [V0.10.11 WO-0.9.94 第二段](CYWEB-WO-0.9.94-PHASE2-01011-20261104.md)：依 §2.1 刪除文字及調整註記計數，待審查，未合併部署。

- [V0.9.88 工作視窗明確關閉](CYWEB-DIALOG-EXPLICIT-CLOSE-0988-20261103.md)：PR #379，已合併部署，待 Claude 事後複審。
- [V0.9.87 客戶介面密度](CYWEB-CUSTOMER-DENSITY-0987-20261102.md)：PR #377，已合併部署，待 Claude 事後複審。

## 已結案交接的原文

| 整理日期 | 範圍 | 固定快照 |
| --- | --- | --- |
| 2026-11-03 | V0.9.48–V0.9.85 的交接（盤點、門市訂購／黑名單／月度待辦、備份、ERP 清理、治理 1.1.24、WO-0.9.68～0.9.76 執行交接） | [handoff @ 4cbc554](https://github.com/simonliu1118-byte/chihyuan-web/tree/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff) |
| 2026-10-28 | 更早的 GPT／Claude／ERP 交接與舊版截圖 | [handoff @ b2d53cd](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/handoff) |

這些原文只作追溯，不作現行規格依據。V0.9.56 Build 1～V0.9.64 的 Claude 事後審查結論在 2026-11-03 快照的 `CYWEB-CLAUDE-REVIEW-0956-0964-20261102.md`。
