# CYWEB V0.9.48｜隔離還原階段 A＋B 一次交 Claude 最終審查

- **狀態：Claude 審查完成——需修正（見 §5）；不合併、不部署。**
- 日期：2026-10-28（臺灣時間）
- Repo：`simonliu1118-byte/chihyuan-web`；分支：`cyweb/next-work-20261028`
- PR：[ #300 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/300)，base `main`
- 版本：V0.9.48 Build 0（正式站仍 V0.9.47 Build 0）
- **執行：ChatGPT；審查：Claude（尚未開始）**。每次返修同步更新本檔，審查結論由 Claude 親自填寫。

## 1. 指示、範圍、已確認原因

使用者先要求將 ERP／叫貨／Email／Backup 實機驗收結果更新 TODO／CHANGELOG，另新增 ERP 完成通知由畫面右上移右下的待辦。對備份管理「驗證隔離還原」通用失敗及「更新紀錄」無結果，使用者委派本地 Work 以 Cloudflare MCP **唯讀診斷**，隨後指示修正階段 A（可觀測性），再要求階段 B 的程式流程一併完成後，**兩份 PR 只送 Claude 一次完整審查**；不需要將完整 handoff 文字貼回使用者。

唯讀診斷：正式主 D1 schema migration 已到 **0029**，固定隔離 D1 仍停留 **0014**，缺 45 張表且具有既有非種子資料與歷史成功演練 Audit；它是**已使用歷史復原副本**，必須保留。當天兩次 `/rehearse` 為 HTTP 409，沒有新的演練 Audit 或還原前安全備份。**若來源 loadVerified 成功**，必在目標 schema 表覆蓋檢查 `BACKUP_TABLE_COVERAGE_MISMATCH` 被阻擋；原始代碼並未從當次 Logs 取得，仍屬強推論。已排除本次僅由 HR Migration 種子假陽性引起的猜測。

本版**未授權、未執行**：重試演練／清空或套 Migration 至舊隔離庫／建立新 D1／改 Worker 綁定／正式 D1、R2、GCS 寫入／開備份排程／合併或部署。階段 B 的新空白目標及封存流程須另案核准。**勿將正式資源名稱、識別碼、原始請求識別、個資或 credentials 放入 Public Git**。

## 2. 本 PR 逐檔修改清單（含審查交接文件）

| 檔案 | 改動與目的 |
| --- | --- |
| `shared/backups.ts` | 增加演練結果型別、`BackupHistory.rehearsals` 及固定安全錯誤代碼／中文訊息。 |
| `worker/backup/backup-service.ts` | `isolatedRecovery` 覆蓋來源讀取、目標檢查、安全備份、寫入／核對、結果紀錄等階段；安全失敗碼、phase、requestId 寫既有 Audit，並以最小 console 訊息輔助查核。新增 `loadBackupRehearsals`，Workspace scoped，近 90 天、至多 100 原始 Audit、彙整最多 30 筆演練。 |
| `worker/http/backup-routes.ts` | `GET /api/admin/backups` 回傳演練歷史；`POST /rehearse` 409 使用已知安全錯誤碼與對應中文訊息。保留 `SUPER_ADMIN`、Origin、雙重確認與固定目標檢查。 |
| `src/runtime/modules/BackupOperationalPage.tsx` | 增加「隔離還原驗證紀錄」，區分成功、失敗、未確認，顯示時間、phase、代碼與診斷識別；「更新紀錄」讀取演練歷史。 |
| `scripts/backup-rehearsal-http.test.mjs` | 測試安全錯誤訊息、GET 的 Workspace 範圍、Audit 敏感 metadata 不傳出。 |
| `scripts/backup-ui.test.mjs` | 驗證失敗階段、錯誤碼、結果待確認畫面。 |
| `VERSION`、`package.json` | 0.9.48；`BUILD` 仍為 0。 |
| `TODO.md`、`CHANGELOG.md` | 保存使用者驗收回報、診斷已證實／未證實差異、V0.9.48 變更與待辦；ERP 完成通知位置尚未實作。 |
| **治理 PR #301（非本 PR diff）** | 將使用者的 CYWEB GPT 修正留 handoff、Claude 最終審查要求放入獨立 `governance/*` 分支，更新 `PROJECT_RULES.md` §9.1／`GOVERNANCE_VERSION`／治理變更紀錄；本功能 PR 已還原其 `PROJECT_RULES.md`，避免違反治理 CI。 |
| `docs/handoff/README.md` | 增加本版待審 handoff 索引，並連結治理 PR #301。 |
| 本檔 | GPT 完成報告、變更清單、驗證證據、Claude 審查待填區。 |

之前的 PR #299 是已結案的文件整理，非此 PR 的審查差異；PR #300 原本只有驗收文件，後續擴充為 V0.9.48 階段 A 修正。

**治理分支拆分補記**：曾在功能分支新增 `PROJECT_RULES.md` §9.1，隨後 Governance Check 提示「repository governance changes require governance/*」。因此已把功能分支 `PROJECT_RULES.md` 完全還原至 main，另開 [PR #301](https://github.com/simonliu1118-byte/chihyuan-web/pull/301)（治理版本 1.1.24、變更紀錄、獨立 handoff）讓 Claude 審查。本版仍依使用者當次明確指示進行 handoff／Claude 審查；不能把尚未合併的 #301 說成 main 已採納的規則。

## 3. 完成報告：驗證證據與成本

- [x] **階段 A＋B 最新程式提交**（更新 handoff 前 HEAD `cb990f569d07e8bd1725dd7aad6a30bdf109bfaa`）：[Governance Check #40662905471](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662905471) success；[Runtime Check #40662905472](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662905472) success（前後端 typecheck、source contracts、Worker regression tests、local D1 acceptance、Vite build）；[CY Web Deploy PR 驗證 #40662905385](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662905385) success，`deploy-development` skipped。
- [x] **治理／受控輪替入口 PR #301**（更新 handoff 前 HEAD `38a32799aefb514127f4e3b977f6e1be5db70e68`）：[Governance #40662751520](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662751520)、[Runtime #40662751519](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662751519)、[Deploy PR contract #40662751588](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40662751588) 均 success；正式 deploy skipped。
- [x] `backup-rehearsal-http.test.mjs` 與 `backup-ui.test.mjs` 已納入 Runtime Check 的 Worker 測試組。
- [ ] Claude 獨立審查與必要返修；[ ] 正式環境只讀效能與操作驗收；[ ] 桌面／手機截圖（未提供）。
- 本次程式修正沒有呼叫 Cloudflare、沒有正式 D1/R2/GCS 讀寫或資源異動（皆為 0）；遠端查核由先前本地 Work 的獨立唯讀任務完成。本次沒有取得新版 Audit 的實際 rows read，**不得虛構成本或配額**。

## 4. Claude 審查優先檢查

- [ ] **權限／資訊安全**：`SUPER_ADMIN`、workspace join、白名單錯誤碼與原始 metadata 的洩漏風險；不得輸出真實 Cloudflare 識別或業務內容。
- [ ] **故障可信度**：`started`／`verified`／`failed` 去重及排序、Audit 寫入失敗後的「結果未確認」、可能已寫入的還原目標不能再試；歷史前置失敗不可補成假 Audit。
- [ ] **測試涵蓋**：HTTP fixture 用 mock `isolatedRecovery`；是否需要增補 BackupService 的實際前置失敗 Audit 整合測試？審查中發現缺口請列為阻擋或返修。
- [ ] **資料量**：90 日 Audit、SQL LIMIT 100、結果最多 30 筆、既有 `idx_audit_events_time` 及 `backup_sets.workspace_scope` 的查詢計畫；避免 D1 高耗讀。
- [ ] **UX 與隔離安全**：更新紀錄、loading、錯誤、長代碼手機換行；舊隔離 D1 必須保留，不得新增清空、改綁、重試、回復正式主庫等路徑。
- [ ] **治理**：逐檔檢查 PR #300 差異、版本、TODO／CHANGELOG 和本 handoff 一致；確認功能 PR 不再修改 `PROJECT_RULES.md`。治理規則另見 PR #301，兩份 PR 皆須由 Claude 審查；Public Git 不含正式環境機密。
- [ ] **審查後**：Claude 寫回以下紀錄並提供具體結論；若需修正，GPT 更新本 handoff 及測試後再交審。Claude 審查通過仍需使用者另外授權合併／正式部署。

## 4B. 階段 B 完成報告及新增逐檔修改（提交 Claude 一次審查）

**程式層的階段 A、B 已整合，雲端建立／改綁／新演練尚未授權及執行。** 功能 PR #300 與治理／部署 PR #301 應由 Claude 在同一輪統一審查，不要先審 A 再審 B。

- `scripts/provision-backup-recovery.mjs`（功能 #300）：提供 `rotate-recovery` 所需的唯一 `YYYYMMDD` generation 輪替。核對現有 Worker 的主 D1、歷史 `RECOVERY_DB`、已使用狀態與帳號資源名稱是否相符；候選名稱若已存在即拒絕；新建時 Cloudflare 回傳的 UUID 也不得出現在執行前的資源清單，以免誤接管既有 D1。獲核准手動 dispatch 後才建立 1 個新 D1，先證明無業務資料表、再用 forward Migration 建立 Schema、比對主 D1 所有 sqlite_master DDL 與 HR seed-only 空白狀態。若失敗不清除、不覆寫、不改綁。成功僅將新的候選 ID/名稱交給受保護的正式部署程序；後續正常部署可識別版本化名稱且不自行輪替。
- `scripts/provision-backup-recovery.test.mjs`（功能 #300）：新增正常部署保留、已輪替目標的後續部署、手動核准／分支／操作型別鎖、名稱碰撞與重送拒絕、來源主 D1 排除、舊目標使用狀態、供應商回傳既有 UUID、候選髒資料、Schema mismatch、建立後失敗保留孤兒資產等 synthetic 測試。初次 CI 曾抓到測試 fixture 與新主 D1 排除檢查的問題，已修正並須以最新 HEAD CI 重驗。
- `shared/backups.ts`、`worker/http/backup-routes.ts`、`src/runtime/modules/BackupOperationalPage.tsx`（功能 #300）：加上 `rehearsalHistoryAvailable`，當可選的 Audit 查詢失敗時仍讓 Super Admin 看得到 R2/GCS 備份目錄，且明確提示歷史 unavailable 不等於零次驗證；不應錯誤顯示成功。
- `worker/backup/backup-service.ts`（功能 #300）：將 90 天／100 原始事件的 Audit 演練列表強制透過現有 `idx_audit_events_time` 查詢，避免未限制時間的全表掃描。Claude 應檢查 query plan 與 Workspace join。
- `scripts/backup-rehearsal-http.test.mjs`（功能 #300）：補 Audit provider 失敗、備份主目錄仍能讀取且不洩漏例外文字的回歸測試。
- `scripts/erp-business-query.test.mjs`（功能 #300）：GitHub CI 暴露 ERP 佇列測試同毫秒提交時隨機 UUID 導致排序 fixture 不穩。只在 synthetic 測試中明確配置提交時間，維持原三筆／隊列順序行為，不修改 ERP 生產程式。
- `docs/development/CYWEB_RECOVERY_ROTATION_RUNBOOK.md`（功能 #300）：新增兩階段控制、核准條件、保留舊副本、候選孤兒資產、成本與讀寫估計、唯讀查核與新目標演練之完整操作手冊。
- `TODO.md`、`CHANGELOG.md`（功能 #300）：兩階段程式已提交、歷史 0014 副本保留、CI／Claude 審查待最終確認，正式雲端輪替和還原仍是獨立需要使用者核准的操作。
- `.github/workflows/development-deploy.yml`（治理 #301）：只有 main `workflow_dispatch operation=rotate-recovery` 加上唯一 generation 與完整確認短語，維持原 `cyweb-production` 鎖及 Source/Identity/health gate；新增在遠端更動前檢查 feature PR 的輪替引擎存在。**推薦先合併 feature #300，再合併治理 #301**；未全部合併不得觸發 rotate。
- `scripts/deployment-source.test.mjs`（治理 #301）：檢查 `rotate-recovery` 只能從 main 手動觸發且先有來源 guard，且一般 deploy/push 原有行為及保護不變。
- `GOVERNANCE_CHANGELOG.md`、`docs/handoff/CYWEB-GOV-1.1.24-CLAUDE-REVIEW.md`（治理 #301）：同步說明受保護 rotation 入口的作用及 Claude 審查欄位；新的 GPT handoff 規則仍在 `PROJECT_RULES.md` §9.1。

### Claude 請特別審查

- **雲端新庫權限**：未符合 `workflow_dispatch`、main、指定 operation、雙重確認、受保護 GITHUB_ENV 的條件，必須在任何 Cloudflare API 呼叫前拒絕；正常部署不得自動輪替。
- **新候選安全與生命週期**：原已使用庫仍保持綁定直到候選驗證成功；每次 generation 不可重用；已建立但遷移或驗證失敗的候選不清空、不刪除、不自動重試。確認 DDL 完全相符、僅 canonical HR seeds、無其他資料，且主 DB 不被覆寫。
- **交叉 PR 依賴**：#301 先合併、#300 未合併時的來源 guard 必須阻擋 rotation；PR CI 的成功不代表正式部署。兩份 PR **一次**共同審查並分別於各自 handoff 記錄 Claude 發現與結論。
- **資料庫額度**：D1/schema 讀取、Cloudflare 1 個新 D1、最多 100 個 inventory 分頁、29 份 Migration 的成本預估及停止條件見 runbook §4；本次功能／治理 GitHub 修正對 Cloudflare API 的實際讀寫均為 **0**，不虛構雲端費用。
- **操作尚未核准**：這次全部完成的是可以交 Claude 審的程式碼、測試與程序，不是執行 Cloudflare 建庫／改綁／正式測試。要等 Claude 通過及使用者授權後才另行發生真正資源變更。

## 5. Claude 最終審查紀錄（請 Claude 親自填，GPT 不代填）

- 審查日期：2026-10-28
- 審查者：Claude
- 審查 PR head SHA：#300 `1a66850905177fcbdadce44eabe4c4f2b52476ea`；#301 `84e3fc7278e80ae4687e99092f8585529fe03370`（兩份同輪審查）
- 結論：**需修正**（修正 R1–R3 前不可合併）
- 問題清單（依嚴重度）：
  - **R1（阻擋）新輪替目標永遠不會補 forward migration。** `scripts/provision-backup-recovery.mjs` 的 `alreadyUsed()` 以「任一資料表有列」判定已使用，沒有排除 migration 種子（0018 起 `hr_stores` 1、`hr_job_titles` 5、`hr_shift_types` 6、`hr_leave_types` 18）。輪替建立的新 D1 一定帶種子，下一次一般部署即被當成 used、不再套 migration；main 一出現 0030，演練又會 `BACKUP_TABLE_COVERAGE_MISMATCH`，重演本次事故，只能再輪替。另外輪替時的 seed-only 檢查自行寫死筆數，與 `worker/backup/portable-backup.ts` 的 `MIGRATION_SEEDS`（含逐列 predicate）重複且較寬鬆。
    - 修法：把種子判定抽成 `.mjs` 與 Worker 都能引用的單一來源（含 predicate），`alreadyUsed()` 與輪替 seed-only 檢查都改用它；「只有標準種子」視為未使用、可補 migration。
    - 補測試：「輪替後的新目標在下一次一般部署遇到新 migration 時會被遷移」，以及「種子被改過或多一列時視為已使用、不遷移」。
  - **R2（應修）`loadBackupRehearsals` 強制 `INDEXED BY idx_audit_events_time` 反而增加讀取。** 以全部 migration 建立的 SQLite 做 `EXPLAIN QUERY PLAN`：不加提示時 planner 走 `idx_audit_events_entity_time (entity_type=?)`，只讀 `backup` 類事件；強制時間索引則掃描 90 天內**所有** Audit（含 ERP 查詢等高頻事件）。handoff 所述「避免全表掃描」不成立。
    - 修法：移除 `INDEXED BY`，並修正 handoff／CHANGELOG 的描述。
  - **R3（應修，需改 #300 與 #301）輪替在主 D1 migration 之前執行。** 部署 job 的順序是 `provision-backup-recovery.mjs` → `wrangler d1 migrations apply DB`。若該次 dispatch 的 main 含未套用的 migration，新目標（repo HEAD schema）與主 D1 DDL 必不相符，留下孤兒 D1。runbook 第 3 步以人工流程要求先一般部署，但程式沒有擋。
    - 修法：建立新 D1 **之前**，讀主 D1 `d1_migrations`，確認與 repo `migrations/` 完全一致，不一致即以安全碼停止（零寫入）。也可以在 #301 把 rotate 拆到 migration apply 之後，但仍須在建立前先檢查。
    - 補測試：「主 D1 migration 落後時拒絕輪替且不呼叫建立 API」。
  - **R4（建議）D1 數量累積。** 每次演練永久新增一個 D1 且舊庫不刪。runbook §4 應寫明帳號 D1 數量上限、保留期限與人工封存／清理的核准流程。不阻擋本版。
  - **R5（文字）** CHANGELOG V0.9.48 仍寫「尚未透過本對話執行本機程式測試」，請更新為實際驗證狀態。
- 執行的驗證／截圖／證據：
  - 兩份最新 head 的 GitHub check runs 全部 success，`deploy-development` skipped。
  - 本機 worktree 執行 `npm run typecheck`，以及 `node --test scripts/*.test.mjs`（#300：340 pass；#301：329 pass）。唯一失敗的 `audit-account-portal.test.mjs` 是 worktree 缺 `.tmp/canonical-cyapps`，main checkout 同測試 12/12 pass，非 PR 造成。
  - `git merge-tree` 確認 #300＋#301 合併無衝突；兩份 `erp-business-query.test.mjs` 修正內容一致。
  - R2 的查詢計畫以本機 SQLite 套用 0001–0029 實測。
  - 無截圖，本輪 UI 變更僅新增紀錄區塊。
- 確認無問題的部分：
  - `SUPER_ADMIN`／Origin／雙重確認未降級。
  - 錯誤碼白名單：例外文字、Cloudflare 識別碼不會出現在 Audit 或回應中。
  - 同一 requestId 的 started／failed 去重正確（同 `occurred_at` 依 id 排序）；`started` 但無結果時顯示「結果待確認」，不當成功。
  - Audit 歷史失敗不遮蔽備份主清單。
  - 輪替入口限 `workflow_dispatch`＋main＋`rotate-recovery`＋generation＋確認短語＋`GITHUB_ENV`。一般部署誤填參數會在任何 Cloudflare 呼叫前以 `RECOVERY_ROTATION_NOT_APPROVED` 停止。新建 UUID 不得出現在既有清單；失敗時保留候選、不改綁、不刪舊庫。
- 審查者直接修正內容：無（依使用者指示交回 GPT 修正以節省額度）。
- GPT 返修與複審紀錄（如有）：待 GPT 修正 R1–R3（R4、R5 一併處理），更新本檔與 PR 後再交 Claude 複審。
- 是否可提交使用者決定合併／部署：**否**，待複審通過。
