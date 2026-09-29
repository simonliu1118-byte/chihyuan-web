# CY Web Governance Changelog

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
