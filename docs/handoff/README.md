# 新工作交接入口

本目錄只放**仍在進行或等待 Claude 審查**的交接（`PROJECT_RULES.md` §9.1）。審查通過、正式規格與 TODO／CHANGELOG 都同步後，交接就在文件整理 PR 移出主線；原文由 Git 固定快照保留，不改寫歷史。

現行規格與狀態請看：

- 當前狀態與未完成事項：[根 TODO](../../TODO.md)
- 已完成版本與驗證：[根 CHANGELOG](../../CHANGELOG.md)
- 架構與各模組契約：[architecture README](../architecture/README.md)
- 工作單流程與模板：[工作單 README](../development/work-orders/README.md)

## 目前仍開放

- [V0.20.1 蝦皮／Mo+獨立品類費率](CYWEB-ITEM-MARGIN-CATEGORIES-20261114.md)：商品選填下拉、先設定才可選、所選品類加入基本費率；未選只隱藏對應平台毛利，待Claude審查，未合併／部署。

- [V0.20.0 商品網路毛利](CYWEB-ITEM-MARGIN-ONLINE-20261114.md)：兩費率並排、滿件×全券區間、簡化平台設定與商品詳情同頁；不做AI接口。自動驗證通過，待Claude審查及目視，未合併／部署。

- [V0.19.0 商品毛利第一階段](CYWEB-ITEM-MARGIN-PHASE1-20261114.md)：工程完成、自動驗證通過，待 Claude 審查；目視驗收尚待完成，未合併／未部署。

- [商品毛利分析兩階段規劃](CYWEB-ITEM-MARGIN-PLAN-20261114.md)：僅規劃文件，待 Claude 審查；第一階段非網路、第二階段全部網路範圍，階段實作狀態以各階段handoff為準；不得自行合併／部署。

- [V0.18.13 BOT 巡視摘要／發布點閱](CYWEB-BOT-PATROL-01813-20261113.md)：已發布並補齊證據，待Claude事後審查。

- [V0.18.12 BOT 改稿與工作卡片](CYWEB-BOT-REVISIONS-01812-20261112.md)：待 Claude 審查，未合併／未部署。

- [Claude 審查紀錄 2026-11-09](CYWEB-CLAUDE-REVIEW-20261109.md)：V0.9.87–V0.12.9 事後複審全部通過；#457 已依 §2 修正為 V0.13.0 合併部署，#458 已關閉，推播 outbox 已核對。下次文件整理移出主線。
- [V0.13.0 首頁、公告與通知、個人待辦](CYWEB-HOME-HUB-0127-20261108.md)：原 #457 交接，已結案，下次整理移出主線。
- [V0.12.4 Build 1 BOT 審核推播](CYWEB-BOT-REVIEW-PUSH-0124-20261108.md)：已結案（程式審查通過、Grok 兩路驗收、正式 outbox 核對 2026-11-09 完成），下次整理移出主線。

- WO-0.14.1 六批交接（CYWEB-WO-0141-*.md）：Claude 2026-11-09 審查通過並合併部署（V0.14.7），結論見工單 §9；下次整理移出主線。

## 已結案交接的原文

| 整理日期 | 範圍 | 固定快照 |
| --- | --- | --- |
| 2026-11-09 | V0.9.87–V0.12.9 的交接（BOT 管理中心／推播／Grok 工具、出機與定期維護、盤點紀錄、ERP 未收款與 Session、手機版、進貨輔助、售後維修清單、WO-0.10.24、文件同步、發布分支恢復），均經 Claude 2026-11-09 事後複審通過；結論見 [審查紀錄](CYWEB-CLAUDE-REVIEW-20261109.md) | [固定快照 ff3562c](https://github.com/simonliu1118-byte/chihyuan-web/tree/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/handoff) |
| 2026-11-07 | WO-0.9.94 兩段均已由 Claude 審查通過並完成合併；第二段正式版本 V0.10.12。當前結論見 [工單 §9](https://github.com/simonliu1118-byte/chihyuan-web/blob/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/development/work-orders/WO-0.9.94.md#9-審查紀錄審查者填)；[第一段原交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff/CYWEB-WO-0.9.94-GPT-20261103.md)、[第二段原交接](https://github.com/simonliu1118-byte/chihyuan-web/blob/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff/CYWEB-WO-0.9.94-PHASE2-01011-20261104.md) | [固定快照 c870278](https://github.com/simonliu1118-byte/chihyuan-web/tree/c870278f36ad847a44c3d839bf822e47fbe30dd1/docs/handoff) |
| 2026-11-03 | V0.9.48–V0.9.85 的交接（盤點、門市訂購／黑名單／月度待辦、備份、ERP 清理、治理 1.1.24、WO-0.9.68～0.9.76 執行交接） | [handoff @ 4cbc554](https://github.com/simonliu1118-byte/chihyuan-web/tree/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/handoff) |
| 2026-10-28 | 更早的 GPT／Claude／ERP 交接與舊版截圖 | [handoff @ b2d53cd](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/handoff) |

這些原文只作追溯，不作現行規格依據。V0.9.56 Build 1～V0.9.64 的 Claude 事後審查結論在 2026-11-03 快照的 `CYWEB-CLAUDE-REVIEW-0956-0964-20261102.md`。
