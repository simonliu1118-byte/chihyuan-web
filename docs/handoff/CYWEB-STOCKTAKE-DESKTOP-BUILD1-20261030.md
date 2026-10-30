# CYWEB V0.9.56 Build 1 — 桌面盤點返修（2026-10-30）

## 需求與實作
- 延續 §6 的品號 → 庫別／儲位 → 批號設計；品號／品名／規格只顯示一次，各儲位跨列，各批號直接填數量。
- `StocktakeGroupedDetail.tsx`：增加明確 colgroup，儲位 24%、數量 25%、操作固定 100px，其餘給批號。
- `store.css`：以雙 class 限定覆蓋共用叫貨表格的 800px 最小寬度；移除儲位 120px 下限；表格字級 xs、標題 sm、內容可換行，操作按鈕沿用表格字級；手機輸入維持 16px／48px。
- `StoreStocktake.tsx`：空畫面文字精確改為「請選擇盤點單」。
- `BUILD`：0 → 1；同一分儲位盤點功能返修，VERSION 保持 0.9.56。

## 舊表格調查
- main 基準 a0f429c 已使用 StocktakeGroupedDetail，沒有舊 ERP 平鋪表格分支。
- GitHub 部署 run 41029802222（2026-10-30 16:56–16:57 Asia/Taipei）從 main a0f429c 部署成功，包括 Worker 部署與 HTTPS／靜態資產驗證。
- deploy/cyweb-development 分支仍在 95f93e8，但此次成功部署是 main dispatch，不能因分支落後斷定未部署。
- 截圖的 11 欄 ERP 表格與目前 main 不符；尚未取得使用者瀏覽器載入資產證據，不能宣稱已證實快取原因。Claude／使用者需重載頁面後核對版本與畫面；若仍舊表格，核對實際網址與 HTML/JS 資產。

## 驗證
- npm run build：瀏覽器／Worker TypeScript 與 Vite build 全部通過（既有 bundle size / dynamic import warnings）。
- node --test scripts/store-stocktake.test.mjs：26/26 通過。
- 初次受限執行測試因本機目錄權限失敗；以允許的本機執行重跑通過，未修改測試規避問題。
- 尚未完成瀏覽器尺寸實測及真實裝置驗收；需確認桌面 1024/1280/1440、手機 390、長批號／新增批號／版本衝突提示的換行與操作。

## 邊界與審查
- 未修改 API、數量儲存、ERP 寫回、資料庫或 migration。
- 未合併、未部署。本輪提交交 Claude 最終審查；不得將之前 #318 的審查視為本輪通過。
- Claude 審查結果：待審。

## 使用者本輪授權與 CI 結果
- 使用者於本輪明確指示：單純 UI 修改可合併與部署，較複雜變更才不可直接合併部署。本次依當次指示完成合併與受控部署，不宣稱 Claude 已審查本輪。
- PR #319 Runtime Check（41038254930）：browser-typecheck、worker-typecheck、source-contracts、build 全通過；Governance Check（41038254915）通過。
- 上述「未合併、未部署／待 Claude」為首次提交狀態；本輪授權後以 PR 合併紀錄及部署 run 的最終結果為準。
