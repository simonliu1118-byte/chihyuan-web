# 新工作交接入口

本目錄只放**仍在進行或等待 Claude 審查**的交接（`PROJECT_RULES.md` §9.1）。審查通過、正式規格與 TODO／CHANGELOG 都同步後，交接就在文件整理 PR 移出主線；原文由 Git 固定快照保留，不改寫歷史。

現行規格與狀態請看：

- 當前狀態與未完成事項：[根 TODO](../../TODO.md)
- 已完成版本與驗證：[根 CHANGELOG](../../CHANGELOG.md)
- 架構與各模組契約：[architecture README](../architecture/README.md)
- 工作單流程與模板：[工作單 README](../development/work-orders/README.md)

## 目前仍開放

- [Claude 審查紀錄 2026-11-09](CYWEB-CLAUDE-REVIEW-20261109.md)：V0.9.87–V0.12.9 事後複審全部通過；#457 首頁／公告／待辦設計通過但需重整後才能合併（衝突、版號、SUPER_ADMIN 撤回、表格式表單、時間輸入、新進員工未讀數）；#458 建議關閉。
- [V0.12.4 Build 1 BOT 審核推播](CYWEB-BOT-REVIEW-PUSH-0124-20261108.md)：程式已審查通過；Grok 通過／退回兩路已由使用者轉述驗收（#452）。剩正式 D1 `bot_review_push_outbox` draft 2、3 的獨立核對。

## 已結案交接的原文

| 整理日期 | 範圍 | 固定快照 |
| --- | --- | --- |
| 2026-11-09 | V0.9.87–V0.12.9 的交接（BOT 管理中心／推播／Grok 工具、出機與定期維護、盤點紀錄、ERP 未收款與 Session、手機版、進貨輔助、售後維修清單、WO-0.10.24、文件同步、發布分支恢復），均經 Claude 2026-11-09 事後複審通過；結論見 [審查紀錄](CYWEB-CLAUDE-REVIEW-20261109.md) | [固定快照 ff3562c](https://github.com/simonliu1118-byte/chihyuan-web/tree/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/handoff) |
| 2026-11-07 | WO-0.9.94 兩段均已由 Claude 審查通過並完成合併；第二段正式版本 V0.10.12。當前結論見 [工單 §9](https://github.com/simonliu1118-byte/chihyuan-web/blob/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/development/work-orders/WO-0.9.94.md#9-審查紀錄審查者填)；[第一段原交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff/CYWEB-WO-0.9.94-GPT-20261103.md)、[第二段原交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff/CYWEB-WO-0.9.94-PHASE2-01011-20261104.md) | [固定快照 c870278](https://github.com/simonliu1118-byte/chihyuan-web/tree/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff) |
| 2026-11-03 | V0.9.48–V0.9.85 的交接（盤點、門市訂購／黑名單／月度待辦、備份、ERP 清理、治理 1.1.24、WO-0.9.68～0.9.76 執行交接） | [handoff @ 4cbc554](https://github.com/simonliu1118-byte/chihyuan-web/tree/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff) |
| 2026-10-28 | 更早的 GPT／Claude／ERP 交接與舊版截圖 | [handoff @ b2d53cd](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/handoff) |

這些原文只作追溯，不作現行規格依據。V0.9.56 Build 1～V0.9.64 的 Claude 事後審查結論在 2026-11-03 快照的 `CYWEB-CLAUDE-REVIEW-0956-0964-20261102.md`。
