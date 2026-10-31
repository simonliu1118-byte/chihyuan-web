# V0.9.58 月度待辦：交 Claude 複審

日期：2026-11-01（Asia/Taipei）。分支 `cyweb/monthly-todos-0958`，起點 `main` `7ad8da4e0168e0496769b29a7a4096ffce392885`。目前實作候選，不代表 Claude 通過。使用者授權遠端發布 source；本次有新 schema、排程、權限及備份變更，依「較複雜不可直接合併部署」留 Draft PR。沒有動正式 D1／Worker／Identity 設定。

## 1. 使用者決定與範圍

月度待辦第三頁籤；年月新到舊，每月每門市一列；無上限的動態項目，各項目適用門市獨立設定；不適用斜線。獨立確認日期或無日期，操作紀錄按列收合。新增當月生效，過去月份不回填。設定只有管理員以上，沒有額外設定權限。

另依本回合明確要求：補回門市訂購清單逐列底線，結案剩兩個操作按鈕在欄內水平置中。沒有修改盤點手機版。

## 2. 檔案與原因

- `shared/store-monthly.ts`：共用月份／生效區間／DTO／午夜 cron 常數；停用次月生效、重新啟用保留缺口。
- `migrations/0034_store_monthly.sql`：四個月度資料表、索引／CHECK／FK，保留既有模組授權並擴充 module CHECK。沒有預設門市、項目或員工新授權。
- `worker/store/monthly-service.ts`：JSON joins 批次補齊月份、row/cell 唯一鍵、設定版本及 generated-through guard，排程／頁面共用；不覆寫完成狀態。
- `worker/http/store-monthly-routes.ts`：獨立 module gate、ADMIN/SUPER 設定、十二個月份分頁、二十筆歷程分頁、CAS、request key/hash、原子事件及 Audit、日期及設定驗證。
- `shared/modules.ts`、`StorePage.tsx`：新增一般模組存取與第三頁籤；僅有月度權限時預設可開，不自動授權其他模組。
- `worker/index.ts`、`wrangler.jsonc`、render/verify/validate deploy config 與 schedule test：新增 UTC 16:00 每日排程；自動備份停用時仍保留月度及 catalog 排程。無新 binding 或資源。
- `StoreMonthlyTodos.tsx`、`store-monthly.css`：共用表格、狀態圖示、窄日期欄、無日期、確認取消完成、設定 EntryTable、排序／啟停／適用門市；歷史頁保留、重送及舊回應防護。手機固定年月／操作，其他欄內捲動，避免固定門市欄遮住按鈕。
- `StoreOperationHistory.tsx`：抽出原門市歷程，讓訂購／黑名單／月度共用，保留既有 UI 語意並補月份欄位標籤及非同步序列防護。`StoreCustomerOrders.tsx` 改引用共用元件，沒有改其業務流程。
- `store.css`：桌面分 tbody 的清單補回底線；操作容器置中，四個或兩個圖示均不折行。
- `change-log-labels.ts`：月度 entity/action 中文標籤。
- `worker/backup/schema-columns.ts`、`portable-backup.ts`：四表備份、精確 pre-0033/pre-0034 白名單升級，空白新 target 才可還原；保留 unknown-schema/nonempty-target 拒絕條件。
- `validate_schema.py`、`validate_module_access.py`：新表／模組契約；新增 monthly backend/UI tests，擴充 backup upgrade tests。
- VERSION／BUILD／package：V0.9.58 Build 0。架構、資料字典、TODO／CHANGELOG 同步；這份 handoff 不是另一層永久規則。

## 3. 驗證

- `npm run build`：browser/Worker typecheck、Vite 通過；僅原有 bundle size 與 fixed-point dynamic import 提示。最終本機重點回歸共42項全部通過（含表單及現有訂購流程）。
- 全部 Node 測試在本機 Windows：480 項，472 通過、8 項環境相容性失敗。月度 backend 11、UI 5、backup upgrade 6 均通過。
- 剩餘八項：原有 `backup-rehearsal-http` 六項 mock 路徑 regex 不匹配 Windows 分隔符；`deployment-source` 一項以 LF 切割 CRLF workflow；`secure-entry` 一個檔案使用 URL pathname `/C:/...` 作 esbuild entry。沒有弱化測試或產品 guard；Linux CI 作完整最終驗證。
- 本機 `validate:deploy` 的 POSIX 0600 secret fixture 檢查不適用 Windows；Python 執行檔不可用。相關 Linux CI 必須通過。
- Wrangler local D1 完整 35 支 migration 成功；實際 sqlite schema hash 為 `aae0b66db493643c44db312afdfa45b45fdf90d0d094e7b77c6548835ef4e711`，與已釘選 schema 相符（另釘全 LF／CRLF）。
- 真前端＋真 API handler＋隔離 SQLite／合成身份的瀏覽器驗收：管理員設定項目、當月新增只適用高雄、歷史斜線、日期／無日期、取消完成確認、USER 隱藏設定仍可辦理。未使用正式登入或資料。
- 390px 畫面文件寬390、表格捲動區358／內容562；水費日期視窗160px、右緣348，日期欄不撐寬文件。
- 截圖位於本地工作輸出 `outputs/monthly-todos-list.png`、`monthly-todos-mobile.png`、`monthly-todos-settings.png`、`store-orders-row-lines.png`。截圖只有合成資料，不上傳個資；PR 以 source 與測試重建。訂購實測底線1px，結案2圖示在116px操作內容寬中左右各留30px，確認置中。
- [Draft PR #330](https://github.com/simonliu1118-byte/chihyuan-web/pull/330)，程式及migration驗證 SHA `ae7102f89f74934278fee5dae9ae33fef15367e3`。
- [Runtime Check #41218574899](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41218574899)：四個 jobs 全綠，**完整 Node 484/484、fail 0**；Local D1 runtime acceptance、來源契約、browser/Worker typecheck、Vite build 通過。Linux總數比本機多4項，因Windows secure-entry檔案在載入時即失敗、未展開該檔內測試。前述本機限制沒有被忽略，而是已由Linux完整重驗。
- [Deployment contract #41218574836](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41218574836)：驗證通過，正式部署與 audit jobs 依PR條件跳過，未執行遠端操作。[Governance #41218574848](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41218574848) 通過。

## 4. Claude 複審重點及限制

1. 0034 重建 module access 保留既有 grants；新 module gate 與設定 role gate，不得將設定權限做成新 grant。
2. 首月、新增當月、漏月、次月停用／取消適用、重啟缺口；設定與 cron 並發不得重複或覆寫已完成格。132 項測試避免超過100 binds。
3. cell/settings 修改、業務事件與 shared Audit 原子性；舊版本409、重送不重記事件、同 key 不同 payload409。
4. 可攜備份精確舊 schema 白名單、四表無日期完成往返、非空目標拒絕；不得用泛化相容條件放寬還原。
5. 上線前依既有部署 gate 套用0034並驗證每日排程；正式權限設定、正式登入 E2E、長期每月切換與大量實際門市資料尚需驗收。這次沒有遠端 migration/deploy。
6. 傳輸1 MiB、設定JSON800KB為D1容量保護，不是項目數量限制。很大量欄位會在表格內橫捲。

## 5. 後續顧客訂購方案（尚未在本分支實作）

使用者先要求方案：稱謂先生／小姐；橫線；已取貨／取貨日期；四進度皆可無日期；通知超過七天紅色「未取」pill 並移除天數長句；歷程每筆只能一列；最舊項次1且新紀錄置頂。橫線及操作置中已另獲明確指示並完成，其餘待整體確認後接續。

已確認：通知選無日期，以確認通知當日開始計算七天，畫面仍勾號，不造通知日期。稱謂顯示方案為姓名後附 `'r`（先生）／`'s`（小姐）；這是內部簡寫而非正式英文稱謂，應獨立存值，不改原始姓名、不推測舊姓名或重複加字。後續應檢查訂購帶入黑名單及歷程／備份欄位一致性。

## 6. Claude 最終審查

待 Claude 填寫結論與修正；GPT 不代簽。合併／部署依使用者複雜變更授權界線另行處理。
