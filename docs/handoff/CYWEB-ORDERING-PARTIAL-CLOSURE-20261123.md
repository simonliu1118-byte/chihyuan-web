# CYWEB V0.22.2 — 叫貨明細部分到貨結案

## 狀態與範圍

- 日期：2026-11-23；執行：Codex；Claude 最終審查：**待審**。
- 分支：`cyweb/fix-partial-arrival-closure`；從 `main` 的 `a15f9da9488ad62c60a8b907263b3f8571499cfe`（V0.22.1 Build 0）另開，與 WO-0.23.0／PR #535 的資料庫工作分開。
- 版本：V0.22.2 Build 0。使用者已同意模擬圖樣式、原數量單獨劃線及原備註／結案原因分行。
- 本輪只改叫貨明細呈現，未合併、未部署，未讀寫正式 D1；無 migration、無新增 API 或查詢。正式規格見 `docs/architecture/ORDERING_MODULE.md` 的 V0.22.2 段。

## 修改檔案與行為

| 檔案 | 原因／修改 |
| --- | --- |
| `src/ui/OrderingGrid.tsx` | 從已存的結案標記與已到量衍生兩種顯示標籤；部分到貨結案不套整列刪線，僅原數量刪線、已到量綠字。零到貨結案保留整列連續線。結案 pill 的 title 帶數量與原因；手機沿用 ListRow／BottomSheet 加上已到量與相同摘要。原有結案原因仍在原備註之下，沒有原備註時不留空行。 |
| `src/runtime/modules/erp-item-query.css` | 使用既有 success／muted 色票，結案 pill 內距微縮以容納六字且不增加欄寬；結案原因保留換行。手機數量／狀態分兩行，避免黏成一長串。沒有改全站整列刪線。 |
| `scripts/ordering-grid.test.mjs` | 更新舊「全部結案列都劃掉」的預期，涵蓋兩種分類、原數量刪線、實際已到量、結案摘要、原備註分塊與共用手機明細。 |
| `VERSION`、`package.json` | 新獨立 UI 修正 Patch +1；`BUILD` 保持 0。 |
| `CHANGELOG.md`、`TODO.md`、`docs/architecture/ORDERING_MODULE.md`、`docs/handoff/README.md`、本交接 | 同步行為、驗證與 Claude 待審入口。 |

## 邊界與風險

- 共用 `shared/ordering.ts` 的 `lineState()`、結案原因代碼、接收／結案操作 eligibility 及後端單一 owner 不變；歷史資料直接按現有已到量呈現，不需回填。
- 只有 read-only 叫貨明細套原數量刪線，不影響編輯輸入。已到齊而未指定結案仍維持綠色「已到齊」。
- 結案後若另有既有操作更正已到量，顯示會隨最新資料衍生；不由這次 UI 另存一份分類。
- 數量不可解析時不顯示推算的剩餘量；可解析的剩餘量下限為 0，浮點顯示最多十二位小數，避免二進位尾數。
- 純視覺變更，可回復本次元件／CSS 差異，無資料還原需求。較長備註必須換行，因此內容列可變高；短文字的基本列高不變。
- 桌機保留原生 title，手機直接在既有明細 sheet 顯示完整摘要，不需依賴 hover。

## 已驗證證據

- 最終 `node --test scripts/ordering-grid.test.mjs scripts/ordering-page.test.mjs scripts/restock-layout.test.mjs scripts/mobile-shell-ordering.test.mjs scripts/ordering.test.mjs`：**156 項全通過**。
- 最終 `npm run validate:source`：**通過**，包含既有 schema、資料責任邊界、業務介面及共用表單契約。
- 最終 `npm run build`：**通過**，包含 browser／worker TypeScript 與 Vite build；原有 bundle >500 kB 提示仍在，不是本輪新增的大型資產。
- `git diff --check`：**通過**。提交前 fetch 再次確認 `origin/main` 仍為上述 V0.22.1 基準。
- 使用真正的 `OrderingGrid`、共用樣式與六筆**合成資料**，本機瀏覽器目視／DOM 量測，不連接正式資料：
  - 1440×900 深色：短結案列、待到貨、已到齊的列高皆 **37.59375 px**；六字 pill **82 px**，狀態 cell **95 px**，沒有溢出或加欄寬。
  - 部分到貨列原數量 `line-through`、已到量 success 色，整列沒有 `cy-row-struck`；零到貨結案才保留 `cy-row-struck`。
  - 原備註＋結案原因的兩個區塊座標沒有重疊，長原備註在上方欄內換行、原因另起一行；多行理由的換行也保留。零原備註不留空白行。
  - 390×844 深色：清單數量／狀態分行；展開第二筆顯示已到 10／60 包、剩餘 50 包及結案理由，原備註保留。`documentElement.scrollWidth = clientWidth = 390`，已到量成功色正常。
  - 測試完已還原瀏覽器 viewport。預覽與合成 fixture 均在忽略的 `.tmp/`，不加入公開 repo。

## 待完成／Claude 審查

- [x] 提交前最終測試、source contracts、建置與版面驗證已補入本交接。
- PR CI 以該 PR Checks 的最新 head 為準；建立 PR 後同步將結果寫入 PR 說明，避免為純 CI 狀態再觸發一次完整驗證。
- [ ] Claude 核對本交接、正式規格與 diff，重點檢查：原數量刪線範圍、零到貨整列線、原備註／結案原因的分行、手機單一資料 owner。
- [ ] Claude 於此記錄「通過／需修正」及意見；執行者不代填。
- [ ] 使用者另行授權後才合併／部署。
