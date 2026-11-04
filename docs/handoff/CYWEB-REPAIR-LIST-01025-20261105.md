# V0.10.25 售後維修清單微調交接

- 2026-11-05，GPT；分支 `cyweb/repair-list-width-actions`；V0.10.25 Build 0。
- 基準 main `0e46bb8eb6934f2011f94e3de7c4a14e3db6d4b2`（V0.10.24）。使用者確認前版已部署，本次僅兩項 UI 調整。
- 使用者明確授權本次完成後合併並部署；依既有 main 受控 workflow 發布。Claude 事後複審待填，GPT 未代填審查通過。

## 修改與影響

| 檔案 | 內容與原因 |
| --- | --- |
| `src/runtime/modules/StoreRepairs.tsx` | 桌面清單客戶編號/姓名由 9.6em 加至 12em（13px 字級下 156px，增加 31.2px），故障狀況維持彈性欄吸收差額；六碼編號＋七個中文字院名可單行。交換列印與維修操作紀錄，順序為修改、取消、退回、列印、紀錄，原事件、停用及選單行為不變。 |
| `src/runtime/modules/store-workflow/StoreWorkflowActions.tsx` | 共用四個操作圖示新增可選的 beforeHistory 插槽，維修列印放入其中；其他呼叫者不傳入時維持原四個按鈕。沿用 IconButton 與既有圖示。 |
| `VERSION`、`package.json` | 版本 0.10.24 → 0.10.25；BUILD 維持 0。 |
| `CHANGELOG.md`、`TODO.md`、`docs/handoff/README.md`、本檔及圖片 | 更新交接、版本與驗證證據。 |

沒有 Worker、schema、migration、依賴或部署設定變更；未增加 API／D1 讀取。手機不套用桌面 colgroup 寬度；操作順序依同一 DOM 調整。

## 驗證

- `npm run typecheck`、`npm run build` 通過，僅既有 bundle 大小提醒。
- `node --test scripts/store-page.test.mjs scripts/store-repairs.test.mjs`：40/40 通過。
- `git diff --check` 通過。
- 真實 React 原始碼＋被忽略的本機合成 API 替身預覽，未操作正式資料。1905×1000 畫面中，以合成六碼編號 `TT0009`＋七字名稱驗證姓名欄寬 156px、文字只有一行；DOM 操作順序與畫面一致。
- 列印按鈕仍開「維修單／資訊卡」選單；Escape 可關閉；紀錄按鈕正常展開「尚無操作紀錄」。未觸發實體列印。
- 合成截圖 [REPAIR-LIST-0.10.25-20261105.jpg](REPAIR-LIST-0.10.25-20261105.jpg)，1905×1000；SHA-256 `6930cf6703e1c01a400e839e7504bac32fe7526ced56a127cec688db16aaca7f`。已 read-back 檢視。

## 發布與 Claude 接續

- UI PR [#427](https://github.com/simonliu1118-byte/chihyuan-web/pull/427) 已合併；正式部署 sourceCommit `26965a92ad39998d203f6954e78158e8928aa974`。
- PR [Runtime Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41872518162) 全部 success，包含 Full Node test suite、Local D1 runtime acceptance、Vite build；[Governance](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41872518220) 及 [部署契約檢查](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41872518160) 通過。
- 正式發布 [run 41873019203](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41873019203)：從 main dispatch `development-deploy.yml`、operation `deploy-development`；validate-deployment-contract 與 deploy-development 均 success，實際部署未跳過。排程、兩個入口的版本／來源與 D1 健康、HTTPS、失效 session、正式 portal authority 檢查全部 success。
- 2026-11-05 01:01（台灣）直接唯讀確認正式域名 `/api/health`：`version=0.10.25`、`sourceCommit=26965a92ad39998d203f6954e78158e8928aa974`、`database=ok`、`identityConsumerVersion=1.0.5`。
- 本次圖片已由 Git read-back：104029 bytes，SHA-256 與上方相同。發布後只回填文件，不改產品、版本或再部署。

本次使用者授權 UI 直接合併部署，Claude 請事後核對欄寬分配、共用插槽的其他呼叫者及圖示功能；未擴大到業務行為修改。

### Claude 最終審查

待 Claude 填寫。
