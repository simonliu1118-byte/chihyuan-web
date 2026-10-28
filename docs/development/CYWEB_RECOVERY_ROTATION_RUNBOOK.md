# CYWEB 固定隔離還原 D1 輪替操作手冊（V0.9.48）

> 這是一次受保護的還原目標生命週期操作手冊，**不是 Cloudflare 操作授權，也不是永久規則來源**。完整審查證據與未解項目見 `docs/handoff/CYWEB-V0.9.48-REHEARSAL-CLAUDE-REVIEW.md`。適用於已使用的歷史隔離副本不得清空／覆寫的情境。

## 1. 分階段與預設狀態

- **階段 A（程式）**：錯誤碼、失敗階段、requestId、演練 Audit 及後台「更新紀錄」。它不會修復既有歷史隔離副本。
- **階段 B（受控目標輪替）**：新增受保護的 `rotate-recovery` 手動 dispatch 選項，使用新版不可重用的目標名稱，**只建立新的 D1，絕不刪除或修改原先已使用的隔離 D1**。建立後透過正式 Migration 套用 Schema，和正式主 D1 的 `sqlite_master` 進行精確 DDL 比對，再確認所有非 Migration 種子表沒有資料。全通過後才在同一受保護部署工作中將 `RECOVERY_DB` 指向新 D1。
- **平常部署**：既有 `deploy-development` 或部署分支的流程維持原樣；**真正已有業務資料／被修改的 HR 種子的復原 D1** 只保留、不補 Migration、不自動輪替；**只有與 canonical Migration 種子逐列相符、沒有其他資料**的空白目標，後續正常部署才會補 forward Migration，避免下次版本升級又落後。曾經輪替過的 `-recovery-v<generation>` 名稱會依**既有 Worker 實際綁定的 D1 UUID**反查與驗證，不會用碰巧相同的資源名稱接管。
- **自動備份排程**：仍停用；此版不會為了輪替打開。
- **演練**：輪替完成不代表已還原。後台必須由 Super Admin 另行核對來源、提供原有雙重確認，且先建立驗證 R2 與 GCS `pre_restore` 安全備份，才允許對**新空白 D1**執行一次還原。舊歷史副本不再操作。

## 2. 條件與程序：禁止未授權執行

1. Claude 先審查 [功能 PR #300](https://github.com/simonliu1118-byte/chihyuan-web/pull/300) 及 [治理／部署入口 PR #301](https://github.com/simonliu1118-byte/chihyuan-web/pull/301) 的所有程式／測試，將結果填回兩份 handoff；不得跳過。
2. 使用者單獨同意合併後，**先合併功能 #300，再合併治理／部署入口 #301**；後者的 `rotate-recovery` 入口有原始碼標記守門，若 main 尚未包含新版輪替引擎會在遠端操作前停止。
3. 使用者另行同意部署 V0.9.48，先走既有 `deploy-development` 手動發布；確認正式主 D1 已套用截至當前 main 的 migration。普通部署不得切換既有已使用副本。
4. **只有取得另一次明確核准的「建立新 D1 並改綁復原副本」授權後**，由受保護 `development` Environment 的核准操作者在 main dispatch `CY Web Deploy`：`operation=rotate-recovery`；`recovery_generation` 使用唯一的 `YYYYMMDD` 加 1–6 個小寫英數字，例如合成值 `20261028a`；`recovery_confirmation` 必須完整輸入 `ROTATE_ISOLATED_RECOVERY_TARGET`。
5. 既有固定 `cyweb-production` 鎖串行發布；原 `verify-deployment-source.mjs` 需先確認同一 main HEAD，來源提交不能被新提交超越。輪替入口需 `workflow_dispatch`、main、顯式操作類型、確認短語與 GITHUB_ENV；任何一項不符，**在 Cloudflare 讀寫前拒絕**。
6. 先 GET 既有 Worker `DB`／`RECOVERY_DB` 綁定、D1 資源清單及既有副本使用狀態。若綁定不明、主／隔離 ID 相同、既有副本只有標準 Migration 種子而尚未使用、輪替名稱已存在，**拒絕輪替，不建立新目標**。接著在新 D1 建立前讀取正式主 D1 的 `d1_migrations`，必須與已審核 repo `migrations/*.sql` **檔名及數量完全一致**，否則以 `RECOVERY_ROTATION_PRIMARY_MIGRATIONS_OUTDATED` 拒絕並停止，**零個新 D1、零筆雲端寫入**。正常發布應先套用主庫 Migration，才可由人工另外核准輪替。
7. 通過上述檢查後才建立全新 D1；若新資源裡已有業務資料表，停止而不跑 Migration。遷移至 main 的完整 forward schema；比對主／新 D1 的 DDL **完全一致**；確認新 D1 除 4 類固定 HR Migration 種子列外，沒有其他業務資料。任何一項不符：**停止並保留新建立但尚未綁定的目標，絕不自動清空、覆寫、刪除或改綁**。重試同一 generation 一律因名稱碰撞被拒絕，需要另行調查。
8. 全部通過才將本次新 D1 UUID／名稱注入該次 CI 的受保護 `GITHUB_ENV`，由原本的正式 Worker deploy 換綁**僅 `RECOVERY_DB`**；原主業務 `DB`、CYID、其他綁定與資料不能切換。原歷史隔離副本仍完整存在 Cloudflare 帳號，需由操作方獨立封存其名稱、ID 與舊演練 Audit（**不要上傳 Public Git**）。
9. 受保護部署與健康檢查成功後，使用 Cloudflare MCP 執行**唯讀**確認：主 D1 ID 不變、`RECOVERY_DB` 與主 D1 不同且指向本次新目標、其 Migration/Schema 最新、僅 Migration 種子列、原歷史隔離副本仍存在。核對正式 Worker/source SHA、健康檢查與當日用量。
10. 只有使用者另行核准，才可按原後台流程做**一次**手動 GCS 隔離演練。成功後該目標即成為不可覆寫的歷史副本；下一次演練須由相同受控流程建立**另一**唯一代次的新 D1，不復用。

## 3. 失敗／回復與安全停止條件

- 任何 GET、DDL、Migration、seed count 或 Cloudflare 額度錯誤，停止本次輪替。**不要用 force、清空、手工修改 Migration 或重試相同目標名稱來繞過**。
- 在 Worker 部署前失敗：原 Worker 的 `RECOVERY_DB` 仍是舊綁定，新候選 D1 若已建立則視為待查孤兒資產並保留；不可擅自刪除。
- Worker 部署後健康檢查失敗：先以**唯讀**方式核對 Worker 綁定及原主 D1 狀態；不自動再次部署或覆寫。由 Claude／操作者根據證據規劃原受控發布來源的回復，另獲核准。
- 雖有相同 Schema，若新目標包含非預期列，仍拒絕啟用；**Schema 相容與空目標是兩道獨立守門**。
- 因主 D1 Migration 版本落後、超前或與 repo 不一致，**在新 D1 建立之前**拒絕本次輪替並回報安全錯誤碼；不在輪替中同步改主 D1，應先以一般受控部署使其與已審核來源一致，再另行核准輪替。若對應 Schema DDL 仍不相同，停止且保留已建立之候選、不可重用其 generation。
- PR CI 上的 `deploy-development` 必須 skipped，絕不因檢查通過自動建立／輪替任何雲端資源。

## 4. 額度與成本預估、核對義務

輪替是有計費影響的雲端作業。操作前，須由有 Cloudflare MCP 的本地 Work 先**唯讀**核對帳號實際配額、既有 D1/R2/GCS 使用量與可接受成本；未知時不能推定有足夠餘額。

**D1 數量與歷史副本保留（Claude R4）：**每次成功輪替理論上多保留 1 個 D1。實際 Cloudflare 帳號的 D1 資源數量上限依當時方案、已佔用配額與官方限制，不在程式或本文件臆測固定數字；操作前需唯讀確認「目前資源數量／適用上限／剩餘可建立數」，無法核實則停止。既有成功或部分失敗的復原副本**預設無自動刪除期限、永久保留直至使用者另行核准保留政策**。建議由負責人另訂最短保留年限、封存位置、容量預算及定期人工盤點，先在受保護私人資產清冊登記目標代次、產生時間、來源、演練狀態、保留原因和關聯 Audit。超過配額或需清理時，先經使用者**逐一書面批准**、審核 Audit／法遵保留要求及可用性；不得以輪替失敗、額度告警或 CI 通過為理由自動刪庫。刪除或封存執行須獨立授權與驗證，**不包含在本次 PR**。

代碼所設定的讀取上限與正常估算：
- 讀取 Worker settings 1 次；D1 清單最多 100 頁、每頁 100 筆（正常遠少於此數；若帳號異常龐大，停止）；舊目標資料表最多 128 個名稱，加一次 `EXISTS`；新目標建後表格查核兩次；主／新 D1 各 1 次 `sqlite_master` 結構查詢（至多 512 物件），另一次 seed-only 空白檢查。**預估每次常規候選為個位數到十多次 Cloudflare API 讀取，主／新 D1 schema 各約數百物件；實際 rows read 不從預估轉成已測值。**
- 寫入：**最多 1 個新 D1 資源**，以既有 29 份（及未來經版本核准的）forward Migration 建 schema、固定 HR 種子列；若最後核准部署，新增 1 次對原 Worker 的受控發版／復原綁定更改。絕不寫既有歷史隔離 D1 或覆寫主 D1 的業務資料。
- 新 D1 的建立、migration 及 Worker deploy 可能產生費用；**實際費率、migration rows-written 和配額剩餘都必須由操作者查證**。如遇額度／成本告警、限流或不明高費用立即停止，不得更換路徑反覆嘗試。
- 完成報告逐步列出 D1 rows read／written、Cloudflare API calls、是否產生一個新 D1、是否發布、備份開關狀態及所驗證的 SHA。敏感識別碼只放受保護執行環境，不入 Public handoff。

## 5. 使用者與 Claude 審查的剩餘關卡

此版只完成**受控輪替程式與測試**，未代表使用者授權 Cloudflare 建庫或改綁。Claude 應確認：對歷史資產「保留」優先於便利重試、人工核准和雙重確認不可繞過、正常部署不能默默切換、候選資源異常時一律停止、GITHUB_ENV 只使用可信執行環境、受保護部署 Worker 不變主 DB。任何實際輪替都必須是另案明確批准的正式作業。
