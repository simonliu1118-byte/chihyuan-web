# CYWEB V0.9.49 — 季度隔離還原演練與超管主動提醒／Claude 審查 handoff

- **狀態：Claude §8 已通過原 head；N1–N3 非阻擋建議已在原 PR 返修，新增提交待 Claude 複審；仍未合併／部署，Cloudflare 物理解綁另案。**
- 日期：2026-10-28（Asia/Taipei）
- Repo：`simonliu1118-byte/chihyuan-web`
- 分支：`feat/cyweb-quarterly-rehearsal-20261028`
- 基準 main：`7e1da88ae6080d42b6ef5e1570a2543cb7ae18e9`（已合併 PR #300、#301、#302）
- 版本：V0.9.49 Build 0；正式版不因本分支自動更新。
- 執行：ChatGPT／GPT；**最終程式審查由 Claude 親自填 §8，執行者不代填。**

## 1. 原始使用者要求與決定

使用者確認 2026-10-28 既有 0014 舊隔離庫**已由使用者刪除**（此對話未重新讀取 Cloudflare）；並要求於 V0.9.49 完成截圖五項：

1. 演練成功事件 phase 顯示「完成」；
2. 成功的結果在頁面明顯、持續可見；
3. 隔離庫已使用後停用「驗證隔離還原」；
4. 演練成功後**自動斷開隔離資料庫綁定**，供後續受控清理；
5. 輪替手冊改為「只長期保留最近一個已使用隔離庫」。

隨後使用者加上：**每季要主動提醒超管做一次隔離演練**。本工作將「每季」定義為**台灣時間曆季**（1–3、4–6、7–9、10–12 月），在任何模組登入的 `SUPER_ADMIN` 主動看到持續的頁首提醒；完成本季演練後不再提醒。這是**站內主動提醒**，不代表無登入時主動 Email、SMS、Push 或自動建立／還原 D1，這些均未授權且需要另外的服務／接收設定。

**重要未完成事項：第 4 項真正 Cloudflare 物理解除 Worker `RECOVERY_DB` 綁定尚未完成。本次實作的是演練成功後即刻的「邏輯解除使用資格／UI、API 防重複」，不能對外聲稱資源已從 Cloudflare 解綁。** 原 Worker 沒有 Cloudflare 控制平面寫入憑證；不可為了此需求將管理 Token 放入 Worker，也不可在成功 Audit 尚未確認時無條件修改綁定。請 Claude 評估受保護排程／部署控制平面方案與實際執行門檻，另案編碼審查後才可啟用。

## 2. 逐檔修正及原因

| 路徑 | 本輪改動與驗證重點 |
| --- | --- |
| `VERSION`, `package.json` | 0.9.48 → 0.9.49；`BUILD` 仍 0。 |
| `shared/backup-quarterly.ts` | 新增純函式台灣曆季判定、成功演練當季免提醒政策，跨 UTC/台灣時區邊界。 |
| `worker/backup/backup-service.ts` | 新增 `loadQuarterlyRehearsalReminder`，於目前季度起始時間之後以 Workspace 篩選 Audit `backup.rehearsal.verified`，只傳回需要的時間及 Qn/due；新增 `isRecoveryGenerationConsumed` 以原 Audit 的 `targetGeneration` 防止同代次已開始實際還原／成功後再次演練；前置來源／安全備份失敗且隔離庫仍空白時，允許受控重試。成功與失敗 Audit 的 metadata 增加此代次標記；原雙端安全備份與資料還原順序不改。 |
| `worker/backup/portable-backup.ts` | 新增 `isEmptyRecoveryTarget` 唯讀探查，重用既有 `layout`／完整 canonical seed guard，缺表、版本落後、無法確認即回 `false`；不寫入隔離 D1。 |
| `worker/http/backup-routes.ts` | `GET /api/admin/backups/quarterly-reminder` 僅既有 CYID SUPER_ADMIN／有效成員可讀；完整備份紀錄新增 `recoveryReady`、`recoveryBlockedReason`，已使用／結果未確認的目標不允許 UI 顯示再驗證。讀取失敗則安全地視為不可驗證、但不遮蔽其他備份紀錄。POST 演練送入部署端 target generation。 |
| `worker/backup/runtime.ts`、`scripts/render-deploy-config.mjs` | 保持原 Worker source of truth；部署時依合法版本化隔離庫名稱衍生 `RECOVERY_TARGET_GENERATION`（標準舊庫為 `legacy`），不向前端傳出真 D1 UUID。 |
| `shared/backups.ts` | 新增 readiness、阻擋原因及 `BACKUP_TARGET_ALREADY_REHEARSED` 安全中文錯誤碼。 |
| `src/App.tsx` | 在現有 AppShell `systemNotice` 共用區增添**全域超管季度提醒**，初次登入、重新回到可見分頁及最多每小時校正；同季度節流，不改 Toast 權威。提供「前往備份管理」與「本次先關閉」（只對目前登入暫停；重新登入仍可見）。完成演練立即觸發更新。其他角色完全不發請求也不顯示。 |
| `src/runtime/modules/BackupOperationalPage.tsx` | `completed` 中文顯示「完成」，成功 Audit 額外顯示可長期觀看的結果區；`recoveryReady=false` 時桌面／手機均不提供再次驗證，並顯示需新隔離目標。POST 成功立即將當前 UI 標成已使用，不等待刷新。 |
| `src/runtime/modules/backup-operational.css` | 明顯的成功結果框，遵循系統原色票、手機可換行。 |
| `scripts/backup-quarterly.test.mjs`、`scripts/backup-schedule.test.mjs` | 台灣季度換季時間、沒有成功 Audit 需提醒、本季成功免提醒；第二支已納入原 Runtime Check 測試集。 |
| `scripts/backup-ui.test.mjs` | 桌面及手機版已使用目標隱藏按鈕、完成結果不誤稱已物理解綁。 |
| `scripts/backup-rehearsal-http.test.mjs` | SUPER_ADMIN 專屬季度提醒、工作空間限定查詢、已使用代次 409 對應安全訊息。 |
| `docs/development/CYWEB_RECOVERY_ROTATION_RUNBOOK.md` | 每季人工演練工作流程、超管站內提醒、**最近一個已使用副本**保留策略、明確 Cloudflare 物理解除綁定限制；舊庫清理需人工核准，不自動刪庫。 |
| `TODO.md`, `CHANGELOG.md` | 區分已完成程式、使用者回報的舊庫刪除、尚未完成實體解綁、後續 Claude 審查／授權和排程停用。 |
| `docs/handoff/README.md`、本檔 | 本次每一項 GPT 修正、測試、未解項目、審查欄位。 |

## 3. 安全及帳務界線

- **不自動還原、不自動建立新 D1、不自動刪除 D1、不改 Worker 實際綁定、不啟用 `CF_BACKUP_SCHEDULE_ENABLED`**。正式 Worker 及備份數據未變。
- 停用驗證 UI 不取代真正後端保護：原 `validateEmptyBackupTarget` 檢查仍在，另外加入唯一 target generation 的 Audit 重複演練鎖。真正進入還原後即使失敗也不自動解鎖；如果只在來源／雙副本安全備份前置檢查失敗、隔離庫仍空白，則允許原本受控流程安全重試。metadata 不明時由實際 schema／row 檢查 fail closed。
- 由於原 backup POST 只對已授權的單次人工驗證執行，季度提醒 API 完全唯讀，不會讓 USER／ADMIN 存取稽核狀態。
- 操作前仍依既有配額、源資料、Schema、空白目標、雙重確認及 `pre_restore` R2＋GCS 雙端驗證要求。
- API 登入的超管每季讀取一次新提醒，切回分頁後最多約每小時查一次。實際 Cloudflare rows-read／費用未測，不可聲稱已具備精確用量。
- 歷史已使用目標的實體刪除、Worker `RECOVERY_DB` 真正移除及每季重新輪替，都必須在受保護控制平面另行核准、實機驗證及留下 Audit，不能因成功通知自行推定完成。
- 「只保留最近一個」是**保留政策／人工清理候選規則**，不是立即或無條件銷毀其他副本的授權。失敗或結果不明時，保留上一個驗證成功的副本。

## 4. 自動驗證紀錄

- [x] [Governance Check #40700460625](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40700460625)：success，程式 SHA `9fd739918d611b2e5d3b3c5d12d66900efaf7773`。
- [x] [Runtime Check #40700460744](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40700460744)：success（前後端 TypeScript、Worker tests、backup-schedule 季度測試、local D1 acceptance、Vite）。
- [x] [CY Web Deploy PR contract #40700460735](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40700460735)：success，正式 deploy-development skipped。
- [x] 首次 [Runtime #40699410730](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40699410730) 曾因前置 R2/GCS 安全備份失敗被誤當成目標已使用而失敗。修正後只在 `backup.rehearsal.started` 或 `verified` 鎖定，local D1 驗收已通過。
- [ ] Claude 依最新 PR HEAD 與本文審查；最後文件提交後新 HEAD 的 CI 以當次結果為準。
- [ ] Claude 審查本版 POST target generation 事件順序、重試競態（並發請求）、回傳 Audit 的季度邊界及成本。
- [ ] 實機 Desktop／Tablet／Mobile 驗收待正式獲權後進行；本輪未操作正式 Cloudflare。

本輪 GPT 修改只有 GitHub 工作分支提交，**Cloudflare D1/R2/GCS/Worker 讀取 0、寫入 0、建新庫 0、部署 0**。

## 5. 我對 Claude 的補充建議（未自行擴大實作）

1. **物理解除綁定需另外的受保護控制平面**：Worker 自己不能安全地移除 Cloudflare D1 Binding；建議在另案審核 GitHub Actions／Cloudflare 控制端的唯一綁定和 Audit generation 配對，並且與正式 Worker source SHA 與 Secrets 保護流程一起審查。不要給一般 Worker 具有 Cloudflare 資源管理權限的 Token。
2. **後端併發鎖**：target generation 已有 persisted Audit 防重複，然而同時兩個請求的讀取與寫入可能競爭；建議如需嚴格 once-only 可增設專屬 schema 的原子 `INSERT OR IGNORE` claim、狀態和清理策略，避免同一代次完全並發時競態。
3. **季提醒傳達管道**：目前為登入後的全站提醒，能覆蓋所有 CYWEB Super Admin；若使用者希望未登入也能被通知，需要另行授權 Email 目標與服務來源。不可借用 CYID 身分驗證郵件功能直接外發業務提醒。
4. **季度週期**：採曆季而不是固定 90 天；每季成功 1 次就停止提醒，未完成下一季照樣提示，不自動執行。

## 6. GPT 完成報告及遺留風險

- 本版只完成站內季度提醒、醒目成功狀態、已使用目標 UI／後端防重複與保留政策；**物理解除綁定仍是明確未完成的高風險項目**，不得以「全數完成」對外敘述。
- 使用者所說舊 0014 隔離 D1 已刪除僅為回報，沒有 Cloudflare MCP 實況驗證；本對話不操作資源。
- 季度提醒目前只在超管登入 CYWEB 時出現，不承諾網站關閉後的推播；操作仍須超管人工核對。
- 已提交的版本、測試和文件見 §2。請以本 handoff 最後提交後最新 PR head 的 CI 再決定是否可審。

## 7. Claude 需優先檢查的阻擋條件

- [ ] Workspace、SUPER_ADMIN 授權與節流：所有模組通知不暴露 Audit 到其他身分；後端不用跨 workspace 的成功演練誤解除提醒。
- [ ] 反覆還原／結果未確認：被認定已使用的目標不能透過 POST 繞開按鈕停用；錯誤與非確定狀態不誤顯示成功。
- [ ] 新增 `RECOVERY_TARGET_GENERATION` 必須由受控 Worker 部署來源帶入，且服務端拒絕未經驗證的來源任意填入 generation。
- [ ] 併發演練是否需要更強原子鎖（安全阻擋），特別是資料寫入開始與 Audit 寫入失敗的時序。
- [ ] 季度提醒是否必須調整 API 範圍（僅查必要欄位）、時區起訖及已登入 UI 更新事件，確保沒有全表掃描或過度 Cloudflare 成本。
- [ ] 成功結果、disabled control、長錯誤碼和手機密度驗證；「完成」為成功事件專屬。
- [ ] 物理解綁尚未完成，不能審查通過後誤宣稱整個五項需求都已實現。

### 補充：CI 發現與 Claude 後續評估

- 初版把 `backup.rehearsal.failed` 也認為已使用，造成 local D1 前置備份故障測試失敗。已限定真正開始還原之 `started` 或成功 `verified` 才鎖定，保留前置安全失敗可重試、實際寫入後不可重試的分界。
- 季度提醒單次為 workspace-scoped Audit JOIN／`LIMIT 1`；管理頁另做一次隔離目標唯讀 Schema／種子檢查。**遠端 rows-read 及費用尚未量測**，Claude 應評估。
- Worker 無 Cloudflare 管理 Token；邏輯鎖定不能被稱為物理解綁，需獨立受保護控制平面與使用者許可。

## 8. Claude 最終審查（僅 Claude 填）

- 審查日期：2026-10-28
- 審查者：Claude
- 審查的最新 PR head SHA：`c3f3241d36137f18bf384c3b28f49784c11afbcc`
- 結論：**通過**（下列意見皆不阻擋合併）
- 問題清單（依嚴重度）：
  - **N1（建議）** `BackupLatestRehearsalResult` 在 90 天內一律顯示最近一次「✓ 完成」與「請勿對同一隔離目標再次執行」。下季輪替出新目標（`recoveryReady=true`）後仍會顯示，與季度提醒並列時容易混淆。建議只在 `recoveryReady === false` 時顯示，或改寫成「上次驗證」。
  - **N2（文字）** `src/App.tsx` 註解寫「at most every 6h」，實際 interval 與節流都是 1 小時。成本可接受：每位超管每小時 1 次 `LIMIT 1` 查詢。請把註解改成一致。
  - **N3（小）** generation 已使用而被擋時，失敗 Audit 的 phase 記成 `source_read`，畫面顯示「來源備份核對」。可把檢查移到 try 前，或給獨立 phase（例如 `target_lock`）。
  - **N4（既有，非本版引入）** 兩個並發 POST 可能同時通過 generation 與空白檢查。restore 為單一 D1 batch，後到者會失敗並記錄為失敗，不會雙寫成功；前端另有 busy 鎖，限超管操作。可接受。
- 已執行的測試、CI、UI／D1 證據：
  - 最新 head check runs 全部 success，`deploy-development` skipped。
  - 本機 `npm run typecheck`、`node --test scripts/*.test.mjs` **363 pass／0 fail**、`npm run build` 通過。
  - 逐檔檢查重點：
    - 季度起點以台灣時間換算（`Date.UTC(...) - 8h`），上限 `<= now`。
    - `isRecoveryGenerationConsumed` 只計 `started`／`verified`：前置檢查失敗不消耗目標，restore 開始即鎖定。`legacy` 名稱仍由實際空白檢查 fail-closed。
    - GET 的 `isEmptyRecoveryTarget` 失敗時回傳 false，不遮蔽備份清單。
    - 新 API 位於既有 `SUPER_ADMIN` gate 之後。
    - `RECOVERY_TARGET_GENERATION` 只由版本化名稱推得，不暴露 UUID。
  - 對照正式現況：現有綁定 `20261028a` 的成功 Audit 不含 `targetGeneration`，但新庫已有資料，空白檢查判定為不可用，按鈕會正確停用；2026-Q4 已有成功演練，季度提醒不會顯示。
- Claude 直接修正與 GPT 返修紀錄：無。N1–N3 可在下一版一併處理，不需返修本 PR。
- 物理解綁依規格是否可放行／需要另案：**需另案**。同意不把 Cloudflare 管理 Token 放進 Worker。建議方案：
  - 一般部署時，若 `provision-backup-recovery.mjs` 判定已綁定的目標為「已使用」，且 Audit 有對應的成功演練，就不輸出 `CF_RECOVERY_D1_DATABASE_ID`，`render-deploy-config` 便不綁定 `RECOVERY_DB`。之後使用者即可在 Cloudflare 刪除該 D1。
  - 同時放寬輪替條件：無綁定時也可建立新目標，並保留 `-recovery-v*` 名稱碰撞與 UUID 檢查。
  - 這只動受保護部署流程，不需在 Worker 放 Token。需獨立 PR 與審查。
- 是否可提交使用者決定合併或部署：**可以**。合併與部署由使用者決定。
 
## 9. GPT 依 Claude §8 N1–N3 完成返修（待 Claude 複審）

**注意**：§8 的原始 Claude 審查日期、head `c3f3241d36137f18bf384c3b28f49784c11afbcc`、結論及全部意見**保持原文，不以 GPT 代填／改寫**。本節是 §8 之後的增量提交交接，必須重新檢查最新 head 才可宣稱複審通過。

| Claude §8 意見 | 本次逐檔實作 | 回歸與仍需確認 |
| --- | --- | --- |
| **N1** 新庫換好仍顯示舊的「✓ 完成」，同時又提醒本季要演練，易混淆 | `src/runtime/modules/BackupOperationalPage.tsx` 新增 `shouldShowLatestRehearsalResult`：僅 `recoveryReady === false` 且演練歷史可讀時顯示醒目的成功結果；新空白目標 `recoveryReady === true` 時不顯示該大框，**歷史清單仍保留過去 verified 紀錄，季度提醒獨立依當季 Audit 判斷**。保留原有成功後顯示及後端鎖定的行為。 | `scripts/backup-ui.test.mjs` 增補 ready true／false／unknown／Audit 讀取失敗的 visibility cases；請 Claude 核對超管換庫後不會混淆。 |
| **N2** 註解與排程實際頻率不一致 | `src/App.tsx` 改註解為「登入／頁籤切回、每小時最多檢查一次」，**不修改** interval、節流、來源 API、通知權限或費用；原每小時檢查仍保持。 | 既有 `scripts/backup-schedule.test.mjs` 季度 reminder regression 及 Runtime Check；請以最新 head 確認。 |
| **N3** 已使用 generation 拒絕回報 `source_read` 階段不準確 | `worker/backup/backup-service.ts` 在 `isRecoveryGenerationConsumed` 與 `BACKUP_TARGET_ALREADY_REHEARSED` 之前設 `phase="target_lock"`，通過鎖檢查後才設定 `phase="source_read"`。保留原有 Audit 失敗回報、錯誤白名單、雙重確認及隔離空庫保護。前端 `rehearsalPhaseLabels` 加入 `target_lock: "隔離目標使用狀態"`。 | `scripts/backup-ui.test.mjs` 增補 phase 顯示不再誤標「來源備份核對」；後端仍應由 Claude 依 `isolatedRecovery` catch／Audit 流程核對時序。 |

### GPT 增量驗證與安全邊界

- 本次只改 3 份正式程式（`src/App.tsx`、`src/runtime/modules/BackupOperationalPage.tsx`、`worker/backup/backup-service.ts`）、1 份 `scripts/backup-ui.test.mjs` 與 `TODO.md`／`CHANGELOG.md`／本 handoff。**無新 Migration、無改 Cloudflare Worker 綁定、無正式 D1/R2/GCS/API 操作、無合併或部署**。
- 用戶所提自動**物理**解除 `RECOVERY_DB`、現有的併發 restore race、是否需離線 Email／Push 等事項**不在此次 N1–N3 小項中偷渡實作**；Claude 原 §8 已將物理解綁列為須另案的控制平面工作。
- 返修後 CI 須重新以最新 PR head 評估 Governance、Runtime、Deploy PR-only checks；舊 `c3f3241` 的 363 pass／0 fail 並不能代替這次增量驗證。
- 完成此次返修目的：一次交由 Claude **對 N1–N3 最新差異複審**，若有其他建議可直接記下，不自動修改已核准的其他需求。

## 10. Claude 增量複審紀錄（僅 Claude 親自填寫）

- 複審日期：
- Claude 複審的最新 PR head SHA：
- N1 回歸／UX 結論：
- N2 註解與實際輪詢頻率一致性：
- N3 Audit phase 與重複演練鎖：
- 新發現或建議：
- 最新 CI／本機證據：
- 複審結論：**待複審**（通過／需修正／阻擋合併）
- 是否可請使用者授權合併／部署：
