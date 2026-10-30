# CYWEB V0.9.56 Build 4 — 庫別拆欄與儲位編輯控制

## 本輪需求與授權
僅桌面：移除儲位輸入下的灰色說明，輸入右側加入小型儲存／取消圖示；將庫別拆到規格與儲位之間。手機不變。依對話既有授權，單純 UI 修改通過檢查後合併部署。

## 變更
- `StocktakeGroupedDetail.tsx`：InlineLocation 加 desktopControls（預設 false）；桌面不渲染兩行說明，改為 ✓ 儲存與 × 取消 SVG 按鈕，附 aria-label／title；儲存共用 Enter 的 validity／版本更新／失敗保留草稿流程，取消沿用 Esc 邏輯，送出中兩按鈕停用。
- 庫別獨立為第 4 欄，rowSpan 與同庫別儲位的批號列數相同；儲位欄移除庫別文字。9 欄比例合計 100%，維持清單。
- `store.css`：新增桌面 media 內的單行編輯控制樣式，64px 輸入與右側 22px 圖示。
- `BUILD`：3 → 4，同一盤點 UI 返修。

## 驗證與限制
- npm run build 通過，browser／Worker TypeScript 與 Vite 均成功。
- 盤點 UI／API／表單鍵盤／共用欄位 37/37 通過。
- git diff --check 通過。
- 手機呼叫不帶 desktopControls，仍走原說明與鍵盤行為；本輪新增 CSS 均在 min-width:821px。
- 無 API、資料庫、migration 或 ERP 行為修改，仍只變更 WEB 儲位。
- 真實裝置視覺與點擊操作待使用者驗收；未宣稱已做瀏覽器互動測試。
- CI、合併與部署證據見對應 PR 及 main dispatch deploy run。
