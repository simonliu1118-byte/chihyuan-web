# CY Web Governance Changelog

## 1.1.11 — 2026/10/01

- Development deployment forwards protected R2/GCS settings and uploads validated GCS credentials with the Worker deployment; temporary credential files are private and removed on completion.
- Backup manual activation and scheduled execution require separate opt-ins. Explicit empty cron configuration removes prior schedules when disabled; runtime also rejects scheduled events without the schedule flag.
- Deployment contract checks cover missing/invalid storage configuration, manual-first activation, schedule gating and credential isolation. No storage provisioning or production rollout.

## 1.1.10 — 2026/10/01

- Runtime Check adds backup UI projection tests and a third ephemeral D1 recovery-rehearsal binding.
- Required isolated recovery acceptance checks GCS fallback, both-provider pre-restore safety verification, authority/confirmation denial, nonempty-target rejection, byte reconciliation and structured audit. No remote restore route or deployment configuration is enabled.

## 1.1.9 — 2026/10/01

- Runtime Check requires tiered backup catalog/retention acceptance against actual ephemeral Worker R2 and isolated D1, plus GCS HTTP/JWT regression tests.
- Deployment rendering supports explicit backup opt-in; no default cron, production storage resource or credential is introduced.

## 1.1.8 — 2026/10/01

- Existing Runtime Check now requires portable backup integrity/replication and fresh-database recovery against a separate ephemeral local D1 binding.
- Restore acceptance applies canonical migrations to its isolated target; no new remote resources, live restore endpoint or production rollout.

## 1.1.7 — 2026/10/01

- Complete WorkLog/Settings/Audit protected D1 runtime and remove browser-local authority and obsolete static deployment workflow.
- Add deployed source/consumer declaration and real D1 health verification; invalid Session probes reach the bound provider using valid opaque syntax.
- Preserve exact CYID 1.0.2 mirror and latest common rules 2.7.0.

## 1.1.6 — 2026/10/01

- CY Web 完成 CYID Consumer Contract 1.0.2 adoption marker：`CYID_CONSUMER_VERSION` 由 1.0.1 升至 1.0.2，對齊已完成的 direct-role／Identity Admin／retired Group routes runtime cleanup。
- `docs/contracts/cyid/` 依 canonical `CONSUMER_SYNC_MANIFEST.json` 全量 byte-sync 至 CYID main 1.0.2；mirror 仍為 read-only contract copy，不成為第二套 authority。
- 此治理同步不改 CY Web business/module authorization；只正式宣告與驗證目前 runtime 已採用 provider 1.0.2 consumer contract。

## 1.1.5 — 2026/10/01

- Runtime Check now executes Identity adapter regression tests for direct-role principals, retained authority validation and retired Group routes.

## 1.1.4 — 2026/09/30

- CY Web 作為跨 repository CYID consumer，新增 `docs/contracts/cyid/` read-only contract mirror；內容依 CYID `CONSUMER_SYNC_MANIFEST.json` 同步 current/minimum versions、Consumer Standard、Consumer Changelog、Auth、Role/Access 與 Architecture。
- 新增 `scripts/sync-cyid-consumer-contract.sh` 與 `scripts/validate-cyid-consumer-sync.sh`；sync 依 remote manifest 更新並清除 stale mirror files，validation 對 manifest 與每個 artifact 逐檔 byte-compare CYID `main`。
- Governance Check 與 development deploy 改為同時檢查 contract version support window + exact document mirror；任何 remote contract 文件變更未同步、本地直接修改 mirror 或殘留已移除檔案都會阻止部署。
- `CYID_CONSUMER_VERSION` 升至 `1.0.1`；CYID Minimum Compatible 維持 `1.0.0`。Shared contract mirror 與 CY Web-specific `IDENTITY_ADAPTER.md` 的責任正式分離。
- 修正 current status/document index：CY Web source 0.5.x 已完成 Customer／Item／Defect protected Worker API Phase 1；下一步 protected routes 為 Order／Outsourcing／WorkLog。
## 1.1.3 — 2026/09/30

- CY Web 正式採用 CYCloud Identity shared `CONSUMER_INTEGRATION_STANDARD.md`，不得在本 repo 分叉 shared Role／Identity Admin／Application Access／Session／Email verification／Recovery 語意。
- 新增根 `CYID_CONSUMER_VERSION`，以 machine-readable revision 宣告 CY Web 已採用的 CYID consumer contract；目前 baseline 為 `1.0.0`。
- Governance Check 與 development deploy 都必須從 CYapps `main` 讀取 CYID `CONSUMER_MIN_COMPATIBLE_VERSION..CONSUMER_CONTRACT_VERSION`，確認 CY Web revision 位於 provider 支援窗內；落後最低相容版時 deployment 必須被阻止。
- CYID consumer contract 更新時，CY Web 依 provider consumer changelog／impact classification 進行 migration；不得以 app-local workaround 固定舊 shared Identity semantics。
- App-specific browser cookie presentation 仍可依 CY Web 實機需求調整，但不得削弱 raw token protection 或 provider Session authority。

## 1.1.2 — 2026/09/30

- 依使用者最終確認，CY Web 新 Employee 首次使用流程對外統一稱 **Email 驗證**；登入頁只保留單一一般登入入口，不再維護獨立「啟用帳號」入口。
- Email 驗證信改以具 expiry 的一次性首次登入密碼進入 CY Web；該 temporary credential 只能換取短效 first-login ticket，不得建立一般 Identity Session，也不得登入其他 CY App。
- 使用者完成正式密碼設定後，CYID 只完成 Email 驗證、正式 credential 建立與 temporary credential/ticket 作廢；CY Web 必須回到一般登入頁，要求使用者以新正式密碼重新登入。
- 首次登入密碼逾期、管理員重寄驗證 Email 或 pending Email 被修改時，舊 temporary credential 必須立即失效並重新計算有效期限；對外名稱維持「重寄驗證 Email」。
- CY Web Identity 文件收斂為 `PROJECT_RULES.md` 永久規則、`docs/architecture/IDENTITY_ADAPTER.md` 單一 consumer contract、根 `TODO.md` 單一 current status tracker；dated Identity handoff 不再留在 active tree。

## 1.1.1 — 2026/09/29

- 依使用者最終確認，CY Web Shared Identity 永久規則改採 CYCloud Identity 三層 Workspace Role：`SUPER_ADMIN / ADMIN / USER`；`Identity Admin` 是 ADMIN 上的特殊 capability，不是第四個 Role。
- CY Web 正式定義為所有有效 Employee 都必須可進入的核心帳號管理 App，entry access 固定 TRUE／不可取消；即使沒有任何業務 Module Access，也必須能進入自助帳號設定。
- CY Web 的 Customer／Order／Item／Outsourcing／WorkLog 等 Module Access 由 CY Web 自己保存與 server-side enforcement；Super Admin 全模組自動允許，Identity Admin／Super Admin 可設定 eligible Employee Module Access，一般 ADMIN 完全沒有 Access 設定能力。
- ADMIN 只要有某一 Module Access，即在該 Module 內具有完整管理權；Role 升降不自動改 Module Access。Identity Admin 不得修改自己的 Module Access，也不得修改 Super Admin protected state。
- CY Web 不再把 Identity Group／Group-derived `USER_ADMIN` compatibility role 當作未來權限模型；現有 `0.1.51`／provider `0.1.14` 的 Group-based UI/runtime 只保留為 migration compatibility，後續開發須改接 direct role + Identity Admin capability。
- Employee activation UX 目標同步固定：建立後由 CYID 自動寄第一封啟用信，信內連結直接開啟 CY Web 啟用流程；pending UI 提供編輯／重寄／刪除，寄信失敗不得回滾 Employee。
- Identity Admin／Super Admin 可執行已啟用 Employee 的強制 Email recovery；帳號仍為 activated、密碼保留、新 Email 待驗證並撤銷現有 Session。

## 1.1.0 — 2026/09/26

- 依使用者最新確認，修正永久 Legacy 邊界：舊 GAS／Google Sheets 尚未投入正式使用，現有測試／開發資料不作 production D1 migration source。
- `PROJECT_RULES.md` 改為 fresh-start production D1；保留 forward schema migration、server validation、audit、backup/recovery 與未來 ERP integration 要求。
- `REPO_POLICY.md` 明確把 Legacy 定位為 Private behavior/reference source，Public repo 不建立未使用測試資料的 migration compatibility layer。
- 新增 architecture document map、Business Decision index 與 archive 邊界，避免舊 draft／audit 的 `OPEN`／migration 假設凌駕後續已確認決策。
- 新增 BD-047（Legacy test data 不搬入 production）與 BD-048（SMART ERP 客戶編號可受控更正／變更，Customer internal ID 不變）。
- 新增 BD-049／BD-050 與 `docs/architecture/BACKUP_ARCHITECTURE.md`：D1 維持 live database，R2 定位為每日 operational backup，GCS 定位為較低頻率 cross-cloud DR；同一 logical backup 僅 export 一次並以相同 portable bytes 複寫。
- CY Web／CYAccountingWeb 共用 portable package、SHA-256/read-back verification 與 `BackupStorageProvider` contract；未來收斂為 app-scoped dataset/credential 隔離的 `CY Backup Service / Worker`。
- 新增 `docs/handoffs/CYACCOUNTINGWEB_TIERED_BACKUP_HANDOFF.md`，要求 Accounting 採 additive migration，V0.17 已驗收 GCS production path 在平行驗證通過前不得破壞。

## 1.0.0 — 2026/09/24

- 建立新的 Public `simonliu1118-byte/chihyuan-web`，正式產品名稱為 Chihyuan Enterprise Management System，簡稱 CY Web。
- 採用 AITeam Governance 2.0 三層規則架構與 Common Rules 2.6.0；正式基準 branch 直接使用 `main`。
- 建立 AITeam 共通規則直接同步、下游 sync workflow 與 Governance Check。
- 明確定義 Public-safe 邊界；舊完整 GAS prototype／Git 歷史保留在 Private `chihyuan-legacy-private`，不 mirror 進 Public repo。
- 宣告 AITeam `shared/cy-visual/` 為 CY family visual canonical source；CY Web 不自動套用 Windows Desktop Visual Guide／Windows icon-production 規則，維持獨立 Web Design System。
- 現階段帳號先重用 CYInvoice Cloud 既有相容能力，中期抽離為 CYCloud Identity。
