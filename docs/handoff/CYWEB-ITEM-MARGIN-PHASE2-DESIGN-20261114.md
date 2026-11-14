# CYWEB 第二階段網路毛利設計交接（已接續工程實作）

- 日期：2026-11-14（台灣）。PR #515，分支 `cyweb/item-margin-phase2-design-20261114`。
- 早期僅規劃的固定快照：[e3c5cfbc](https://github.com/simonliu1118-byte/chihyuan-web/tree/e3c5cfbcfe8b8f53ddc0193927efcb439564f077)。
- 使用者後續已授權實作，並簡化欄位、指定滿額比例區間、券互斥及雙費率比較表；本PR接續為 V0.20.0 工程交付，不再是待確認的舊版複雜方案。
- 當前規格：[第二階段設計](../development/ITEM_MARGIN_PHASE2_DESIGN.md)；完整逐檔修改及驗證：[執行交接](CYWEB-ITEM-MARGIN-ONLINE-20261114.md)。
- 舊設計中的適用範圍／日期／啟停／出資／AI核准欄位及訂單組合不在本階段；不加入 AI 接口。券一律互斥並各自配合滿件折扣，依600／799比例上下界計算，不追蹤搭購內容。
- 此設計交接文件亦已更新，所有變更列入新的執行handoff；Claude尚未審查，執行者不得自行合併／部署。
