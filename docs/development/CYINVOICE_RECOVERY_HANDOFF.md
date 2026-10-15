# CYWEB → CYInvoice 裝置災難復原交接

更新：2026-10-14（Asia/Taipei）。此檔是本輪 source review／接手快照；唯一可勾選待辦仍為根 `TODO.md`。不新增 Identity、裝置或治理規則。

## 2026-10-15 CYInvoice 回報：原阻塞已解除，交接文件暫留至完整 DR 驗收

**已由 CYInvoice V3 owner 檢查 Draft #440 exact head `cb67cae7346a9a5df26b5dc5627dd0357ef015fc` 原始碼及完整 CI**。原交接所列「CYInvoice `RecoveryIssueResult` 尚不回 explicit `revoked`」現已**完成**，以下 2026-10-14 的 blocker 敘述僅保留原始交接歷史，**不再是目前 source 阻塞**：
- `apps/CYInvoice/cloud/src/recovery-issuer.ts`：`RecoveryIssueResult.status` 現有 `"revoked"`；`publicState()` 僅在 persisted `revoked_at` 回 `revoked`，consumed／expired 仍為 `failed`。成功 `revokeRecoveryInvitation()` 與已撤銷 readback 皆明確回 `revoked`，不存在與已使用不冒充撤銷。
- `apps/CYInvoice/cloud/tests/recovery-issuer.test.mjs` 已包含成功 revoke、重複 revoke、consumed／expired、D1 已提交但回覆遺失後以原 operation 查回、claim/revoke 同交易競態 rollback 等合成證據；`recovery-cutover.test.mjs` 覆蓋 Device 全撤銷與未完成授權 fence。
- CYInvoice #440 本 head：Cloud validate ×2、Windows Client、Windows x64、Governance 均 success；原 Cloud deployment skipped。CYWEB #151 head `c155baf4e0fda819d97fd950bff7cfeb55e1e0a5`：Governance、Browser／Worker TypeScript、build、source contract、deployment contract 成功，development deployment skipped。

**剩餘未完成且仍是正式 DR 發布阻塞：**兩 repo 同版位契約整合、CYWEB 真 Session／Email／Binding 與 original Worker／D1 配置唯讀稽核、正式 D1／Worker 受控 rollout、實際 Windows 跨裝置 DR-01～DR-13、revoked Device 在途業務 Work Item fencing；在整體 V3 工作順序中依照 CYInvoice TODO 安排在正式折讓／跨機覆核／公司設定之後。**此文件只作已移交證據，暫不刪除；完成後再按文件收尾決定是否歸檔／移除。** 沒有執行任何部署、合併或正式 D1 mutation。

---

## 接手基準與範圍

- CYWEB 原 Draft [#151](https://github.com/simonliu1118-byte/chihyuan-web/pull/151)，branch `cyweb/feat-cyinvoice-recovery-auth-gate`；接手 head `83998147733682c2a785690178ba30e0760ad758`，原正式 main `971c51b7ab4787900b0a2fcb2f0a8199bbf563f4`。本輪將尚未發行的復原功能明確標為 **0.7.25 Build 0**，不改既有部署基準。
- 對照 CYInvoice Draft [#440](https://github.com/simonliu1118-byte/CYapps/pull/440)，source `f0671189eea1a349a4af0ae08908f0e79b3658fb` 的 `recovery-authority.ts`、`recovery-issuer.ts`、named `CyInvoiceRecoveryEntrypoint` 及最新 `CLOUD_WORK_HANDOFF.md`。未修改 CYapps 工作線 source。
- 最新 source／CI 以 [#151 checks](https://github.com/simonliu1118-byte/chihyuan-web/pull/151/checks) 的 exact head 為準；接手文件 head 已通過 Governance `38541378090`、Runtime `38541378300`、deploy-contract `38541382798`，其實際 deploy job skipped。不能以這些舊跑次代替本輪 source 檢查。
- **尚未合併或部署，沒有實際 Binding 注入、D1 migration／maintenance、真 Email、裝置撤銷或正式 Windows Release。** 此輪批准僅處理 CYWEB source／驗收與交接；實際 rollout 另取得具體授權。不新增 Cloudflare 測試 Worker／handler；舊 CYID_ONLY 帳戶表退役不得重跑。

## CYWEB 已修正

1. **Operation ID 保留**：同頁籤的 `sessionStorage` 保存原 UUID、是否已嘗試及是否取得明確撤銷結果，scope 為 Identity Workspace＋stable Employee ID。所有 mutation 前先寫入並 readback；失敗停止 mutation。重新整理／模組重新掛載只恢復原紀錄，不自行重寄或簽第二張。關閉頁籤／清除瀏覽器資料後仍需使用者另存的 ID；不宣稱跨瀏覽器或跨裝置保存。
2. **非權威 checkpoint**：不保存密碼、復原碼、CYID Session、Email 或 server 授權快照。查詢／撤銷仍每次要求當次密碼；原 ID 只作定位，不授權任何操作。已嘗試而未取得明確撤銷時，禁止建立新 ID；貼入外部 ID 只能查詢／撤銷，不能直接簽發。已完成明確撤銷也必須手動產生另一 ID 才能另簽。
3. **shared UI**：移除 native `window.confirm`，沿用 `useConfirmation`／`ConfirmDialog`／`TextInput` 與 navigation busy guard。按鈕明寫「簽發並寄送邀請／放棄簽發」、「撤銷邀請／保留邀請」；confirm 前取得單一 action lock，避免同畫面重入。每次操作結束或取消清除密碼。Workspace／Employee／Role／verified／超管 marker 異動重建該元件 lifecycle；只有 verified SUPER_ADMIN＋真超管 marker 才顯示。
4. **誤判撤銷已移除**：CYInvoice 的通用 `failed` 只顯示 `unavailable`，不顯示撤銷成功、不解鎖新 ID。RPC／browser client 僅接受 allowlisted 狀態及合法 ID／日期；異常回應保持結果不明，無敏感欄位或 arbitrary error message 回顯，無自動重送。
5. **部署 source 接線**：原 development workflow 補上 protected environment 的可選 `CF_CYINVOICE_RECOVERY_SERVICE` → 原 renderer，固定 named `CyInvoiceRecoveryEntrypoint`。未設定仍完全不新增 binding。沒有設定真實值或觸發 deploy ref。

## CYInvoice 必須先補：明確狀態契約（目前阻塞完整流程）

**確切根因：**目前 `RecoveryIssueResult.status` 只有 `sent | pending | failed`；`publicState()` 將 revoked／consumed／expired／delivery failed 都回 `failed`。`revokeRecoveryInvitation()` 連已 consumed 的邀請也回 `failed`，其實未進行撤銷。因此原 CYWEB 把 revoke 的 failed 映射 revoked，會誤報成功。

本輪 CYWEB 已修為 fail-closed，並預留以下最小、明確的私有 RPC 回覆：

| CYInvoice 私有回覆 | CYWEB 處理 | CYInvoice 必須提供的證據 |
| --- | --- | --- |
| `sent`＋`invitationId`＋`expiresAt` | 寄信服務接受；尚非送達或接管完成 | 現有 sent transition／邀請狀態 |
| `pending` | 保留原 ID；手動查詢或撤銷；不重寄 | 現有 pending 狀態／結果不明 |
| **`revoked`**（新增，status／revoke） | 明確顯示已撤銷；允許使用者另建新 ID | 同 workspace／operation 的 `revoked_at` 已成立，或成功原子撤銷後確認；不可將 consumed／expired／不存在映射此狀態 |
| 現有 `failed` | `unavailable`；不能證明撤銷，保留原 ID及另簽鎖定 | 通用回覆不足以區分終態，僅安全呈現 |
| 其他／null／RPC 例外 | `RECOVERY_RESULT_UNKNOWN`；保留原 ID | 不採 arbitrary error fields；不 retry |

請 CYInvoice owner 先完成：

- `RecoveryIssueResult`、`publicState` 與 `revokeRecoveryInvitation` 產出上述 explicit revoked；確保 consumed 不被當成 revoked，重複撤銷／丟失回覆後 status 可查到真實 revoked。
- 保留原 Application-scoped Login／Resolve／verifiedEmail／finally Logout、雙 Workspace／雙 storage profile 與寫入時 SQL guard。這不是 CYID shared contract 變更。
- 補真 SQLite／D1 regression：成功撤銷、已使用時撤銷、已撤銷 readback、DB response lost、claim 與 revoke race。不要只把字串改名而省略 rollback／競態證據。
- 如要支持 `consumed / expired / not_found` 的明確 UX，先在單一 RPC contract 定義各狀態及新簽發的安全條件，再協調 CYWEB；本輪沒有自行推定這些狀態可解開同 Workspace open-invitation 唯一索引。
- 原 `sameIssuer` 在 credentialVersion／employeeRevision 變動後會拒絕舊 operation status。撤銷雖允許目前同 scope 超管處理舊 issuer，仍須明確狀態證據；請把變更密碼／移交後查回與撤銷納入 DR 測試，不能靠 browser 舊 snapshot 放寬。

**目前不應部署為可用復原功能：**原 CYInvoice provider 尚不回 `revoked`，這個正常流程無法取得明確撤銷／重新簽發的完成證據。CYWEB 已做安全呈現，但兩邊契約完整整合仍需 Invoice owner 完成後再驗。

## 授權核對結果與部署前 gate

Source 已核對：三個同源 POST 每次 resolve CYWEB Core Session，拒絕 first-login／非 verified 超管／偽造 scope／超量 body；只傳當次 password＋server principal 的員編、stable ID、Identity Workspace、credentialVersion／employeeRevision 及 UUID。**不轉交 CYWEB bearer／cookie**。CYInvoice named RPC 以自己的固定 `CYINVOICE` App 再登入驗權，其業務 D1 不由 browser 指定。

本工作環境沒有可呼叫的 Cloudflare 唯讀配置工具，也沒有部署此 Draft 的頁面。**真實 active Binding、D1 profile／schema、Email sender secret 配置與真人 Desktop/Mobile 操作仍未驗收**；沒有把 Git renderer 合成測試當成實際配置核對。取得受控唯讀結果後必須核對：

- 原 CYWEB 與 CYInvoice active versions、named entrypoint、正確 Identity／Business scope及原 D1綁定；不把私有值寫入 Public Git。
- Invoice 0014與 optional issuer maintenance 前後相容順序、private backup／fingerprint／rollback/readback、既有資料/history/FK 保留。
- 原 Email adapter 的最低權限、失敗／接受結果不明與送達證據；不能重跑退役 SQL。
- 取得具體部署／資料庫／寄信／裝置接管授權後，才由各 owner 做核准的原服務 rollout；不能新增遠端測試 Worker。
- 舊裝置的 in-flight Work Item／業務 mutation epoch/fencing 仍為 Invoice V3 owner 項目。撤銷 Token 不代表已取消跨服務副作用。

## 驗證與交回順序

本輪 local：Browser／Worker TypeScript、source contracts、部署 renderer＋workflow opt-in contract、五項 checkpoint／React render／actual browser client 合成 regression、actual Worker route 的 Origin／Role／scope／payload／失效／明確撤銷／未知回覆測試通過。Static operational bundle 已建置；它不是第二套網站或部署產物。既有 Identity adapter／navigation 回歸及完整 build／canonical exact-sync 結果以本輪工具與 #151 exact-head checks 為準。

這些測試**沒有**執行真人 browser 的 shared dialog、Desktop／Mobile 目視、真 CYID reauth／Email或Windows DR；不勾選相應待辦。

交回：**Invoice explicit revoked 契約與競態測試 → CYWEB／Invoice 同版本契約整合 → 真配置唯讀稽核 → 具體授權與原服務 rollout → DR-01～DR-13＋真人／多裝置驗收**。Windows 入口保持「直接加入雲端」內的復原按鈕，首次啟動不增加第三選項。
