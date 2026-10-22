# CY Web 未合併 PR 盤點與收尾

盤點日期：2026-10-23。使用者交辦清查截圖中的 38 個未合併 PR，逐一確認是否已被主線涵蓋，再清理已失去開發用途的舊 Draft。此文件是一次性工作紀錄，不是新的治理規則。

## 基準與判定

- 盤點主線：`9302da897e6b743b2380b92c6e7422cd5da8ca2e`（V0.9.30 功能及交接文件）。已補齊本機 shallow history，以下 ancestry 結論基於完整提交圖，沒有以淺層歷史判斷遺漏。
- 開始時共 38 個 Open PR：36 個早期 Draft、CYInvoice Draft #151、一般 PR #267。
- 34 個早期 Draft 的 head 是 `main` 的 ancestor，`git rev-list --count main..head` 均為 0；其原始提交確實已在主線，不只是版本較舊。
- #9、#24、#151 另做實際差異與取代來源核對，詳見下節。不將它們描述成原分支已合併。
- 已關閉 37 個已被涵蓋／取代的 Draft；#267 保留 Open。關閉後仍保留 PR、head branch 與 Git 提交供追溯／必要時重開，不合併舊分支、不刪除分支。
- API 預算：預計每個目標即時核對 1 次、關閉 1 次，共 74 次 REST 呼叫，另做整批唯讀核對與文件 PR，整輪以約 100 次呼叫為上界；開始前已確認 5,000 次／小時的 core 額度尚有足夠餘額。每批至多 12 個、逐一檢查 head／base／Draft／Open 未改變，遇變更跳過；失敗停止，不自動重跑。

## 三個需要額外核對的舊 Draft

### #9：只有過期 package 版本號

唯一不在主線提交 `e1b6b58` 只把 `package.json` 從 0.1.4 改為 0.1.5；其餘提交均已在主線。現行版本為 0.9.30，無應補入的功能，關閉舊 PR。

### #24：核准設計已帶入、舊預覽已淘汰

三個獨立提交為 `f25289b`、`39d6e7b`、`5a4a17e`：舊 Customer preview 的 CSS／import 與核准 Search Pane 文件。

- `docs/architecture/CUSTOMER_UI_COMPOSITION.md` 在 PR 與主線的 blob 完全相同：`5b0e75546ffa30646e324fbfde6b797c3c2bdf56`；主線以 `7efd02a` 帶入核准方向。
- 舊 `customer-approved-layout.css` 已由主線 `46ac868990c9e72d58542b2682276a15b0857e78`（V0.9.2 移除早期 previews）明確淘汰，不應恢復舊靜態預覽。
- 現行 `src/runtime/modules/CustomerOperationalPage.tsx` 使用共用 MasterDetail，搜尋／篩選／筆數／清單在左側 `cy-md-list`，明細在右側 `cy-md-detail`，保留原核准方向。

因此關閉舊預覽 PR，不重新引入已移除的 renderer。

### #151：核心已由 #192 移植，實機 DR 待辦仍保留

- 原始碼已由 [PR #192](https://github.com/simonliu1118-byte/chihyuan-web/pull/192) 選取移植；移植提交 `0df7554`，主線 merge `7ba87b8b30b58af935fef316bd61cfb3d55792ec`。移植時復原 panel、checkpoint、client、Worker route、UI 測試及 source validator 與舊 Draft 相同。
- 目前主線下列五個檔案仍與 #151 head 的 blob 完全相同：`src/identity/cyinvoice-recovery-checkpoint.ts`、`src/identity/cyinvoice-recovery-client.ts`、`worker/http/cyinvoice-recovery-routes.ts`、`scripts/cyinvoice-recovery-ui.test.mjs`、`scripts/validate-cyinvoice-recovery.mjs`。
- 現行 panel 差異為後續共用表單／Dialog／Enter 操作調整；入口依 #226 移至備份管理。Worker 路由、CI 測試、可選 named Service Binding 都已接回目前主線，renderer 另保留後來的排程／隔離復原／人事 bucket 設定，不回退到 0.7.25 分支。
- 本機重新執行 `node scripts/validate-cyinvoice-recovery.mjs` 與 `node --test scripts/cyinvoice-recovery-ui.test.mjs`：安全邊界檢查與 5 項合成回歸全部通過。
- 舊交接全文保留於 [#151 固定來源](https://github.com/simonliu1118-byte/chihyuan-web/blob/a1f09d70239d2e23018ab5c6fec7eb27f916d586/docs/development/CYINVOICE_RECOVERY_HANDOFF.md)。關閉 PR 不刪該文件／分支／歷史。

**關閉 #151 只代表舊開發入口已被主線接手；不代表 CYInvoice 正式 DR 已完成。** 真 Session／Email／Binding／原 D1 配置、受控 rollout、Windows 跨裝置 DR-01～DR-13、撤銷裝置的在途 Work Item fencing 等仍保留在根 TODO，不執行這些遠端操作，也不替外部專案勾選驗收。

## 保留 #267

[PR #267](https://github.com/simonliu1118-byte/chihyuan-web/pull/267) 是 V0.9.31 到貨失敗診斷與寫入後讀回保護，head `610e4355778634c2439cf8c4349238b7d0164d8c`，相對盤點主線仍有 11 個獨立提交；不是本次可清掉的重複 Draft。必要 CI 已成功，但其自身 handoff 仍要求審查及部署後追查 requestId，不能把診斷修正當成原正式例外已查明。本次保留原狀，不合併、不關閉、不部署 #267。

## 逐項證據

下表由盤點快照補入；正式關閉前逐項回讀 GitHub，若 head／base／狀態改變則停止處理該項。

| PR | 目標分支 | 核對的 head SHA | 判定／處理 |
|---|---|---|---|
| [#3](https://github.com/simonliu1118-byte/chihyuan-web/pull/3) | architecture/legacy-data-normalization | `118613df1438323a8f70ab7e5af2291f4630111e` | head 已在 main，獨立提交 0；已關閉 |
| [#4](https://github.com/simonliu1118-byte/chihyuan-web/pull/4) | governance/cyweb-doc-consolidation | `43d21b5dfa5007772fa6036a251e5a17c918b17c` | head 已在 main，獨立提交 0；已關閉 |
| [#5](https://github.com/simonliu1118-byte/chihyuan-web/pull/5) | architecture/d1-schema-draft | `b030a2da4d79e39b0d03eacd38277ececb27b545` | head 已在 main，獨立提交 0；已關閉 |
| [#7](https://github.com/simonliu1118-byte/chihyuan-web/pull/7) | cyweb/foundation-worker-d1 | `8b29eb91e8ce17e055d960af9c65339fb4a137bb` | head 已在 main，獨立提交 0；已關閉 |
| [#8](https://github.com/simonliu1118-byte/chihyuan-web/pull/8) | cyweb/identity-adapter-foundation | `d4ef88581341d7bd536f275793688bbf019cd03d` | head 已在 main，獨立提交 0；已關閉 |
| [#9](https://github.com/simonliu1118-byte/chihyuan-web/pull/9) | cyweb/audit-core-foundation | `e1b6b58aa3bf9b054ae9527d6b63f0bfa48cea94` | 唯一差異為舊 package 版本；已關閉 |
| [#10](https://github.com/simonliu1118-byte/chihyuan-web/pull/10) | cyweb/legacy-reusable-pattern-audit | `66d058ee589331a8bcd0e19369d3da88966b8610` | head 已在 main，獨立提交 0；已關閉 |
| [#11](https://github.com/simonliu1118-byte/chihyuan-web/pull/11) | cyweb/shared-ui-foundation | `c5c9fcad489ac4f2fc9e1cc67a12b6d62a0dbfc1` | head 已在 main，獨立提交 0；已關閉 |
| [#13](https://github.com/simonliu1118-byte/chihyuan-web/pull/13) | cyweb/shared-request-foundation | `06d4e68646607482c6ee799f3851e58bd9cde2d9` | head 已在 main，獨立提交 0；已關閉 |
| [#14](https://github.com/simonliu1118-byte/chihyuan-web/pull/14) | cyweb/domain-baseline-integration | `79da28b93d665c7c5d67c492fb1addb1dc386680` | head 已在 main，獨立提交 0；已關閉 |
| [#15](https://github.com/simonliu1118-byte/chihyuan-web/pull/15) | cyweb/app-shell-foundation | `e7a92eb8846ad455f3d0220374d72df965d7b979` | head 已在 main，獨立提交 0；已關閉 |
| [#16](https://github.com/simonliu1118-byte/chihyuan-web/pull/16) | cyweb/form-guard-foundation | `dd74ec42b2de3dc8578267d5a9fabd80498ea8fb` | head 已在 main，獨立提交 0；已關閉 |
| [#17](https://github.com/simonliu1118-byte/chihyuan-web/pull/17) | cyweb/data-view-foundation | `29cdc84d838ad20739642f41c671a3f3b55e2df6` | head 已在 main，獨立提交 0；已關閉 |
| [#18](https://github.com/simonliu1118-byte/chihyuan-web/pull/18) | cyweb/entity-picker-foundation | `908fb2ea3b449040663a456c9461f23d00270540` | head 已在 main，獨立提交 0；已關閉 |
| [#19](https://github.com/simonliu1118-byte/chihyuan-web/pull/19) | cyweb/editable-list-foundation | `5a833d003832aa889e16b3d52091b09736849c62` | head 已在 main，獨立提交 0；已關閉 |
| [#20](https://github.com/simonliu1118-byte/chihyuan-web/pull/20) | cyweb/overlay-feedback-foundation | `22268d2233d9d000f0c6e81aa83cae69ab254275` | head 已在 main，獨立提交 0；已關閉 |
| [#21](https://github.com/simonliu1118-byte/chihyuan-web/pull/21) | cyweb/keyboard-entry-foundation | `5bee4478dd389c26b503fba0a5bd6e6eb1000326` | head 已在 main，獨立提交 0；已關閉 |
| [#22](https://github.com/simonliu1118-byte/chihyuan-web/pull/22) | cyweb/pre-business-readiness | `1cbc08b214cc79960e02b51cd37fb5cad554686b` | head 已在 main，獨立提交 0；已關閉 |
| [#23](https://github.com/simonliu1118-byte/chihyuan-web/pull/23) | cyweb/customer-module-contract | `ae24549319df37971cb9618fc6c421f2451ce57f` | head 已在 main，獨立提交 0；已關閉 |
| [#24](https://github.com/simonliu1118-byte/chihyuan-web/pull/24) | cyweb/customer-ui-composition | `5a4a17e4683ad52fa7cbf138342f0f72f56160fb` | 設計文件 exact blob，舊預覽明確淘汰；已關閉 |
| [#25](https://github.com/simonliu1118-byte/chihyuan-web/pull/25) | cyweb/customer-edit-interaction | `27b4d8e7c9ca7f9c38c9759f084a9a6e706c1b2e` | head 已在 main，獨立提交 0；已關閉 |
| [#26](https://github.com/simonliu1118-byte/chihyuan-web/pull/26) | cyweb/customer-service-foundation | `ed1c9d8eb6e8d64aa3cdb83cb28ec99fce195e1b` | head 已在 main，獨立提交 0；已關閉 |
| [#27](https://github.com/simonliu1118-byte/chihyuan-web/pull/27) | cyweb/customer-persistence-related | `65d1e251ead016834f1f178e9226f6e1813e888d` | head 已在 main，獨立提交 0；已關閉 |
| [#28](https://github.com/simonliu1118-byte/chihyuan-web/pull/28) | cyweb/customer-related-ui | `e6bd14dd84028dbf4d25246866698eea9996b95c` | head 已在 main，獨立提交 0；已關閉 |
| [#29](https://github.com/simonliu1118-byte/chihyuan-web/pull/29) | cyweb/customer-related-mutations | `9ebdfc92cf9e171cb717293b7962e6c068bd0fcc` | head 已在 main，獨立提交 0；已關閉 |
| [#30](https://github.com/simonliu1118-byte/chihyuan-web/pull/30) | cyweb/customer-related-interactions | `f585eb228535e754c55f7025ee3ef12e32f612fe` | head 已在 main，獨立提交 0；已關閉 |
| [#31](https://github.com/simonliu1118-byte/chihyuan-web/pull/31) | cyweb/customer-full-workspace-preview | `ca46ebc7c28cc06047021a3a67e9585a1a098df2` | head 已在 main，獨立提交 0；已關閉 |
| [#32](https://github.com/simonliu1118-byte/chihyuan-web/pull/32) | cyweb/item-module-foundation | `bfdc9c7940fca57451ffb7838da3974b07706615` | head 已在 main，獨立提交 0；已關閉 |
| [#33](https://github.com/simonliu1118-byte/chihyuan-web/pull/33) | cyweb/defect-service-foundation | `0291e43e3579ea05368f1da6bf8a9b91eb57fa9c` | head 已在 main，獨立提交 0；已關閉 |
| [#34](https://github.com/simonliu1118-byte/chihyuan-web/pull/34) | cyweb/item-full-workspace-preview | `e67170c893254810676c852b140d77d0e578fd42` | head 已在 main，獨立提交 0；已關閉 |
| [#35](https://github.com/simonliu1118-byte/chihyuan-web/pull/35) | cyweb/sales-work-order-foundation | `a6dba109989dd400409b5954f781148a69d802b9` | head 已在 main，獨立提交 0；已關閉 |
| [#36](https://github.com/simonliu1118-byte/chihyuan-web/pull/36) | cyweb/sales-work-order-full-preview | `0fe384d7c5c9148c4dc2d18087b7930d9f96101b` | head 已在 main，獨立提交 0；已關閉 |
| [#37](https://github.com/simonliu1118-byte/chihyuan-web/pull/37) | cyweb/contractor-outsourcing-foundation | `007c61a35236a8b5512d0ef37b14cb6fae5beb9b` | head 已在 main，獨立提交 0；已關閉 |
| [#38](https://github.com/simonliu1118-byte/chihyuan-web/pull/38) | cyweb/outsourcing-full-preview | `7a349f0926f0ede1cdcabf12ccacfbb20cc17fe2` | head 已在 main，獨立提交 0；已關閉 |
| [#39](https://github.com/simonliu1118-byte/chihyuan-web/pull/39) | cyweb/worklog-foundation | `912c9d073e7ec0a2015342458d7ea189902bba0a` | head 已在 main，獨立提交 0；已關閉 |
| [#40](https://github.com/simonliu1118-byte/chihyuan-web/pull/40) | cyweb/worklog-full-preview | `bbb5954912bd328b9ff75ed2ffd52d09042f6fca` | head 已在 main，獨立提交 0；已關閉 |
| [#151](https://github.com/simonliu1118-byte/chihyuan-web/pull/151) | main | `a1f09d70239d2e23018ab5c6fec7eb27f916d586` | #192 移植／5 檔 exact blob，DR gate 保留；已關閉 |
| [#267](https://github.com/simonliu1118-byte/chihyuan-web/pull/267) | main | `610e4355778634c2439cf8c4349238b7d0164d8c` | 11 個獨立提交；保留 Open |

## 執行結果

- 37 個目標全部回讀後關閉：34 個完整在主線、#9／#24 的差異被取代、#151 已選取移植。沒有跳過項目，沒有重跑或改動 PR source。
- 另以一次獨立 GraphQL 回讀全部 38 個 PR：37 個 `CLOSED`、1 個 `OPEN`，全部 `merged=false`，原 head SHA、來源分支及分支 target SHA 均保持一致。另查 Open 列表，唯一剩餘為 #267。
- PR 關閉階段實際 REST 讀取 37 次、更新 37 次，分 12／12／12／1 四批；獨立核對 1 次 GraphQL＋1 次 Open 列表。其餘盤點、Git fetch、文件 PR 為少量額外操作，未觸發限流或自動重試。
- 本次文件更新與 #267 head 以 `git merge-tree --write-tree` 檢查，exit 0、無合併衝突；未改寫 #267 的分支或提交。
- CYInvoice 的真 Session／Email／Binding、D1 rollout、DR-01～DR-13、在途 Work Item fencing 等仍列根 TODO；沒有把關閉 #151 當成通過實機驗收。
- 此次只維護 PR／文件，網站程式、版本、Cloudflare／D1／CYID 資源及正式資料均不修改，正式業務資料讀寫 0 列；無部署與 Release。


