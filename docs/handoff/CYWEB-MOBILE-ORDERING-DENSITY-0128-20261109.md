# CYWEB V0.12.8 — 手機叫貨清單密度及 BOT 圖示
日期：2026-11-09；分支 `cyweb/mobile-ordering-density-0128-20261108`；main 起點 `76822d8c7424e290c0a4b3f378f880835380ffda`。
使用者確認方案 A，並明確允許完成後合併、部署；另追加 BOT 管理中心圖示。禁止帶入未合併的首頁 #457、#458 或 D1 0059。

## 範圍與行為
- AppShell：compact Drawer 隱藏標題列（保留輔助技術標題），CY Web 品牌列右側提供關閉 X。桌機 sidebar 與原導航 owner 不變；BOT 管理中心增加與其他項目一致的線條機器人 icon。
- OrderingPage／手機樣式：搜尋、篩選、顯示未結案同行；未到貨保留原單據分組／展開收合，每品項兩行（品號＋品名／叫貨已到剩餘＋登記到貨結掉）；草稿來源改密集分隔列，按原公司 source 順序及 orderedVendors 個人順序。
- 未修改 Worker、D1、CYID、ERP、權限、草稿儲存、未儲存保護、Excel 分享／下載及桌機叫貨呈現。沒有新 observer、retry、wrapper 或第二個業務 owner。

## 檔案
`src/ui/shell/AppShell.tsx`、`src/app.css`、`src/runtime/modules/OrderingPage.tsx`、`src/runtime/modules/erp-item-query.css`、`scripts/mobile-shell-ordering.test.mjs`、`VERSION`、`BUILD`、`CHANGELOG.md`、`TODO.md`、`docs/architecture/ORDERING_MODULE.md`、`docs/architecture/UI_COMPONENT_CATALOG.md`、本 handoff。

## 測試／風險／Claude 審查
- 電腦版 821px 以上保持原 CSS 與 DOM 業務 owner；手機 375／390／414px 需實機確認品名省略號、數量與操作間距、Drawer X、選單滾動、深淺模式與觸控。
- Node regression、TypeScript、Vite build 與 GitHub Runtime／Governance／Deploy Contract：**尚待 CI 結果**，不得宣稱通過。
- Claude final review：**尚無通過證據**；PR 合併及本次授權部署不得解讀為 Claude 審核通過。
- 按正式 main 完整 SHA 非強制快轉 `deploy/cyweb-development` 觸發部署，健康檢查成功才算正式發佈完成。
