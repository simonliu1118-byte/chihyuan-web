# WO-0.9.21 Cloudflare 用量巡檢

- 狀態：**已完成・Claude 審查通過・PR #225 已合併**（截至 2026-10-23；歷史交付狀態見 §8、§9）
- 分支：`cyweb/usage-monitor`　PR：[#225](https://github.com/simonliu1118-byte/chihyuan-web/pull/225)（已合併）
- 閱讀提示：本單 §0 的「不合併、不部署」、§8 的「待審查／尚未部署」是 GPT **交付當時**的執行界線與證據，不是目前 PR 狀態；§8 完成報告及 §9 Claude 審查紀錄原文保留供交接。
- 依據：`PROJECT_RULES.md` §9；共通規則 `REPOSITORY_RULES.md` §11.3（計量資源與大量資料作業）
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**。部署流程要傳入的新 secret 由審查者處理（見 5.4）。不得新增工作單未列出的檔案類型。
- 不合併、不部署。
- 本功能只**讀取** Cloudflare 用量，不得呼叫任何會修改 Cloudflare 設定或資料的 API。

## 1. 背景

- 2026/10/19 一次 CYACC 科目整理作業用盡了 Cloudflare 帳號共用的 D1 每日讀取額度（免費方案每天 500 萬列）。同帳號的 CYID 與 CY Web 因此一起無法登入，部署也失敗了。
- 使用者決定：
  - 在 CY Web 加用量巡檢，**監控整個帳號**的所有 D1 資料庫，不只 CY Web；
  - 只有超級管理員看得到；
  - 70% 黃色警示、90% 紅色警示；
  - 這期不做 Email 通知；
  - 排在人事第二期之前。

## 2. 已定案事項（不得更改）

1. 範圍是整個 Cloudflare 帳號的 D1：每個資料庫各自的讀取列數、寫入列數，以及全帳號合計。
2. 「今天」以 **UTC 日**計算，與 Cloudflare 額度重置時間一致（台灣時間早上 8:00）。畫面要註明「每日 08:00（台灣時間）重置」。
3. 額度上限寫成 `shared/` 的常數（免費方案：讀取 5,000,000 列／日、寫入 100,000 列／日），註解註明來源與日後升級付費方案時要改。
4. 警示門檻：任一項（讀取或寫入）合計達上限 **70% 黃色**、**90% 紅色**。
5. 用量**不存進 D1**。每次即時向 Cloudflare 查詢，可用 Cache API 快取 10 分鐘，避免反覆查詢。
6. 只有 `SUPER_ADMIN` 可呼叫 API 與看到畫面。不加入模組授權與權限群組（同 HR 的做法）。
7. 本功能本身每次查詢對 D1 的讀寫，只能有身分驗證必要的讀取，不得額外查 D1。

## 3. 範圍

1. **Worker**：`worker/usage/`，負責查 Cloudflare GraphQL Analytics 與 D1 資料庫清單，並整理成摘要。路由 `GET /api/business/usage/d1?days=7`。
2. **共用**：`shared/cloudflare-usage.ts`，內容為額度常數、門檻、型別，以及「依用量算出警示等級」的純函式。附單元測試。
3. **前端**：
   - 「帳號與權限 → 系統與安全」頁籤加一個「用量」區塊，只有超級管理員看得到。
   - 超級管理員登入後，若今日用量達門檻，畫面上方顯示警示列。
4. **部署設定**：`scripts/render-deploy-config.mjs` 把帳號 ID 帶入 Worker 的 vars；`scripts/render-backup-secrets.mjs` 把用量 token 帶入 secrets（見 5.4）。
5. 文件、版本、TODO。

## 4. 不做

- Email 或推播通知（之後再議）。
- R2、Workers 請求數、KV 等其他用量（這期只做 D1）。
- 自動停止任何服務或作業。
- 歷史用量存檔、圖表套件；7 天資料用簡單表格或長條即可。

## 5. 實作指引

### 5.1 Cloudflare 查詢

- **用量**：GraphQL `https://api.cloudflare.com/client/v4/graphql`，查 `viewer.accounts(filter:{accountTag}).d1AnalyticsAdaptiveGroups`。
  - 篩選：`date_geq`／`date_leq`。
  - 取 `sum { rowsRead rowsWritten readQueries writeQueries }` 與 `dimensions { date databaseId }`。
  - 執行前請以官方文件確認欄位名稱。
- **資料庫名稱**：`GET /client/v4/accounts/{account_id}/d1/database`（分頁）取得 uuid → 名稱對照。對照不到的顯示 uuid 前 8 碼。
- **認證**：Worker secret `CF_USAGE_API_TOKEN`；帳號 ID 用 Worker var `CF_ACCOUNT_ID`。
  - token 由使用者在 Cloudflare 建立，只給 **Account Analytics: Read** 與 **D1: Read** 兩個權限。
  - 任何回應、log、錯誤訊息都不得帶出 token。
- **未設定 token 或帳號 ID**：API 回 `USAGE_NOT_CONFIGURED`（503），畫面顯示「尚未設定用量查詢憑證」。
- **Cloudflare 回錯或逾時**：逾時上限 10 秒，回 `USAGE_UNAVAILABLE`（503），不重試。
- **快取**：以 Cache API 快取 10 分鐘。key 含 `days`，不含使用者資訊。回應附上資料時間 `fetchedAt`。

### 5.2 API 回應（摘要）

```ts
{
  fetchedAt: string;                  // ISO
  limits: { rowsReadPerDay: number; rowsWrittenPerDay: number };
  today: {
    date: string;                     // UTC YYYY-MM-DD
    rowsRead: number; rowsWritten: number;
    level: "ok" | "warning" | "danger";   // 依 shared 純函式
    databases: { id: string; name: string; rowsRead: number; rowsWritten: number }[]; // 依 rowsRead 由大到小
  };
  days: { date: string; rowsRead: number; rowsWritten: number }[]; // 由舊到新，含今天，無資料的日子補 0
}
```

`days` 參數只接受 1～31，預設 7。

### 5.3 前端

- **用量區塊**（放在「系統與安全」既有區塊之後，沿用 `cy-op-panel` 與現有樣式）：
  - 今日讀取、寫入：數字、占上限百分比，以及一條進度條，顏色依警示等級。
  - 註明「每日 08:00（台灣時間）重置」與「資料時間 HH:mm」，並有「重新整理」按鈕。
  - 各資料庫今日用量清單：名稱、讀取、寫入、占全帳號讀取的百分比。
  - 近 7 天每日讀寫合計表格。
  - 數字用千分位。
- **警示列**：
  - 超級管理員登入後讀一次 API，之後每 30 分鐘再讀一次；切換頁面不另外查。
  - `warning` 或 `danger` 時，在頁面頂端（外框內容區上方）顯示一行，例如「今日 D1 讀取已用 72%（cyacc-db 占 90%），每日 08:00 重置」，並附「查看」連結到用量區塊。
  - 黃色、紅色沿用既有 notice 色票，可以關閉，關閉後當天不再顯示，可用 `sessionStorage`。
  - API 失敗時不顯示警示列，也不跳錯誤。
- **非超級管理員**：不呼叫 API，也不顯示任何相關介面。

### 5.4 部署設定

- `render-deploy-config.mjs`：若環境變數 `CLOUDFLARE_ACCOUNT_ID` 存在，寫入 `config.vars.CF_ACCOUNT_ID`。帳號 ID 不屬機密，但仍不得印到 log。
- `render-backup-secrets.mjs`：若環境變數 `CF_USAGE_API_TOKEN` 存在，加入輸出的 secrets 檔；不存在則略過，不得失敗。
- 補上上述兩項的既有單元測試。
- **workflow 改動不在本單**：把 GitHub secret `CF_USAGE_API_TOKEN` 傳給該步驟的 env，由審查者在合併前處理。

### 5.5 文件、版本、TODO

- 版本 0.9.21，依既有方式更新版本來源。
- `docs/architecture/API_CONTRACT.md` 加入新路由。
- `TODO.md` 新增 V0.9.21 段落。

## 6. 驗收清單

- [ ] 非超級管理員呼叫 `/api/business/usage/d1` 回 403；未登入回 401。
- [ ] 未設定 token 回 `USAGE_NOT_CONFIGURED`；Cloudflare 回錯或逾時回 `USAGE_UNAVAILABLE`。兩種情況都不洩漏 token。
- [ ] 警示等級純函式有單元測試：69.9% → ok、70% → warning、90% → danger；讀取與寫入取較嚴重的一項；上限為 0 或資料缺漏時不出錯。
- [ ] GraphQL 回應轉換有單元測試：多資料庫、多日期合計，名稱對照，無資料的日子補 0，依讀取量排序。
- [ ] `days` 超出 1～31 回 422。
- [ ] 同一 `days` 10 分鐘內重複呼叫只查 Cloudflare 一次，以測試驗證快取。
- [ ] 本功能沒有額外的 D1 查詢（審查時檢查程式）。
- [ ] 前端：用量區塊與警示列只有超級管理員出現；關閉警示列後同一工作階段不再出現。
- [ ] `npm run typecheck`、`timeout 300 npm run validate:source`、`node --test scripts/*.test.mjs`、`npm run build` 全部通過。

## 7. 截圖要求

由審查者以實際畫面擷取：用量區塊（桌面、手機）、黃色與紅色警示列各一。審查者會用測試資料模擬。

## 8. 完成報告（執行者填）

- PR：[#225](https://github.com/simonliu1118-byte/chihyuan-web/pull/225)，由最新 main `c719d9a` 建立 `cyweb/usage-monitor`。維持未合併、未部署。
- 變更檔案：`shared/cloudflare-usage.ts`、`worker/usage/cloudflare-usage.ts`、`worker/http/usage-routes.ts`、`worker/index.ts`、`scripts/cloudflare-usage.test.mjs`、`scripts/render-deploy-config.mjs`、`scripts/render-backup-secrets.mjs`、`src/App.tsx`、`src/identity/CloudflareUsagePanel.tsx`、`src/identity/SharedIdentityPage.tsx`、`src/identity/identity.css`、`src/ui/shell/AppShell.tsx`、`VERSION`、`package.json`、`TODO.md`、`docs/architecture/API_CONTRACT.md`、本工作單。
- 驗證結果（§6 逐項）：
  1. 未登入 401、非超管 403：Worker 以 CYID `requireIdentity` 驗證後判斷 `SUPER_ADMIN`，測試包含 USER／ADMIN／未登入。
  2. 未設定 503 `USAGE_NOT_CONFIGURED`；上游錯誤、逾時 503 `USAGE_UNAVAILABLE`，對外不回傳 token／上游內文；附測試。
  3. 純函式涵蓋 69.9%／70%／90%、讀寫取嚴重者、零上限及缺漏值。
  4. GraphQL 轉換測試覆蓋多資料庫、多日期、零資料、缺失名稱 UUID 短碼及依讀取量排序；零用量資料庫仍列出。
  5. days 僅 1–31，超出回 422；附路由測試。
  6. 快取 key 包含 days 與 UTC 日期（不含任何使用者資訊），600 秒，跨 UTC 午夜不會使用前一日快取；附測試驗證同 key 遠端只查一次。
  7. 功能完全不執行 D1 SQL，僅 CYID 身分授權；附無 D1 可用的路由測試。
  8. 前端只有超管可見與呼叫，登入後讀取一次、30 分鐘輪詢；錯誤時靜默不顯示警示，`sessionStorage` 記錄當天關閉。
  9. 驗證：既有 [Runtime Check #39363931290](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39363931290) **success**（worker/browser TypeScript、source contracts、D1 local、Vite build），[Governance Check #39363931282](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39363931282) **success**。本批含跨 UTC 日期快取邊界與 esbuild bundled Node 測試，完整單檔測試尚待另行執行；**完整 `node --test scripts/*.test.mjs` 尚未獨立執行，不能宣稱通過**。本地容器 DNS 無法解析 github.com，無法完整 checkout。
- GraphQL 欄位確認來源：[Cloudflare D1 Metrics and Analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)：`viewer.accounts(filter:{accountTag})`、`d1AnalyticsAdaptiveGroups`、`date_geq/date_leq`、`sum.rowsRead/rowsWritten/readQueries/writeQueries`、`dimensions.date/databaseId`；官方 D1 Analytics API 支援最多近 31 天資料。DB 名稱使用只讀 D1 database list API。
- 已知限制：需要部署者於 Cloudflare 提供 `CF_USAGE_API_TOKEN`（僅 Account Analytics: Read 與 D1: Read）及 `CLOUDFLARE_ACCOUNT_ID`，並由審查者**另行**於原 workflow 安全傳入 token；本 PR 不修改 workflow。Cloudflare 連線尚未使用真實帳號驗證；UI 桌面／手機與黃色／紅色警示截圖交由審查者驗收。無 Email、其他產品用量或任何 Cloudflare 寫入。

## 9. 審查紀錄（審查者填）

### 審查（2026-10-20）：通過，審查者修正 5 項

- 本機驗證：`npm run typecheck`、`timeout 300 npm run validate:source`、`node --test scripts/*.test.mjs`（163/163）、`npm run build` 全部通過。
- 以模擬資料截圖驗收：黃色、紅色警示列，以及用量區塊的桌面與 390px 版本。
- 審查者修正：
  1. 讀取、寫入兩條進度條原本共用合計警示等級（例如寫入超標時讀取條也變紅），改為各自依該項比例上色。
  2. 警示列原本固定寫「占全帳號讀取」；由寫入觸發時，改為依觸發的那一項找占比最高的資料庫。
  3. 從警示列按「查看」後，`showUsage` 一直保留，之後每次進帳號與權限都會被切到系統與安全；改為離開頁面就重設。
  4. 手機版警示列的「關閉」按鈕會被擠到下一行；改為文字獨佔一行、按鈕並排。
  5. `development-deploy.yml` 的 secrets 步驟加入 `CF_USAGE_API_TOKEN` 傳遞（工作單 5.4 指定由審查者處理）。
- 尚未驗證：真實 Cloudflare token 連線。等使用者建立 GitHub secret `CF_USAGE_API_TOKEN` 並部署後實機確認；未設定前畫面顯示「尚未設定用量查詢憑證」，不顯示警示列。
