# CYWEB 叫貨修正交接給 Claude


## 2026-10-27 V0.9.38 — 修改已送出單、刪除草稿、排序與拖曳

- **修改已送出單**：前端 `revising` 狀態保存本機副本，`OrderingGrid` 在修改模式的 `onCommit`／`onDelete`／`onReorder` 都只改本機（新列用高於 2^52 的本機 id），按「儲存」只送有變動的列（含 `sortOrder`）、刪除清單與備註到 `POST /orders/:id/revise`；伺服器一次 `mutate`，版本 +1、一筆修改紀錄摘要。切換單據或來源前若有未儲存修改會確認。
- **刪除草稿**：`DELETE /orders/:id` 只限 DRAFT，版本鎖，明細隨外鍵 CASCADE 刪除，留稽核 `ordering.deleted`。
- **排序／拖曳**：`OrderingGrid` 標題排序只影響顯示（`Intl.Collator` 自然排序）；未排序時項次可拖曳，草稿走 `lines` 的 `operation:"reorder"`（同一區段，依序 10、20…）。
- 「全部廠商」合併匯出移除（伺服器 `/vendors/overview` 仍保留但前端不再呼叫）。

## 2026-10-26 V0.9.36 — 廠商頁直接編輯、單位與廠商品名、備份納入叫貨

- **廠商頁**：移除「全部廠商」總覽表格與 `commitVendorRow`／`deleteVendorRow`／`vendorOrderIds`。廠商頁籤（來自啟用中的 VENDOR 來源、依個人順序，「其他」最後）點下去就是 `openDraft(id)`，下方顯示與其他來源相同的草稿編輯畫面；`reloadOrder` 依單據來源種類保持在廠商頁。`/vendors/overview` 只剩「匯出廠商合併 Excel」使用。
- **單位／品名不再被帶回**：伺服器只在 `final` 且該次請求含 `itemCode` 時用 ERP 補空白的品名／單位；已存列明確送空字串的欄位不補；數量拆出的單位也只在該次送了 `quantityText` 時套用。前端改記「哪些欄位只被自動存過」，確定時只重送那些欄位（新列的確定儲存會帶品號）。
- **廠商品名跟隨**：`vendorNameFollows` 為 true 的已存列，廠商品名欄位值為空、`placeholder` 顯示品名，聚焦時提示字隱藏；空白離開不送出。唯讀與匯出仍顯示實際值。
- **可攜備份**：見 TODO V0.9.36；`schema-columns.ts` 加入 9 張 `ordering_*`，`validate_schema.py` 不再排除。

## 2026-10-26 V0.9.35 Build 1 — 總覽舊草稿與到貨重複送出

- **廠商總覽**：`showVendorOverview` 原本只新增 `vendorOrderIds`、從不刪除，草稿送出／作廢後總覽仍寫向舊單而一直 409。現在載入時伺服器回 `orderId:null` 就刪除對應；`commitVendorRow` 若快取中的對應單已非草稿也改開新草稿。
- **登記到貨**：`receive` 以 ref 擋住進行中的第二次送出，按鈕 `disabled`／`aria-busy`。原本第二次會排在第一次之後並用更新後的版本，部分到貨會被記兩次。
- 後端未改，無 migration。

## 2026-10-26 V0.9.35 — Claude 審查 V0.9.27–0.9.34 後的修正（已合併並部署，當前狀態）

- **部署**：使用者 2026-10-26 批准「可以部署並合併」。PR #278 合併 main `41a3b0d0711fd20d1f63c2701bebfe04a9e396b6`；原 `deploy/cyweb-development` 以 merge commit `c8186be2a02c45b3586cd8d022bc8d58a7aea0c6`（parents：原 tip `5af960b8`、main；tree 與 main 相同，無 force-push）發布。[Actions #40262682205](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40262682205) `validate-deployment-contract`、`deploy-development` 皆 success；遠端 D1 `✅ No migrations to apply!`；正式 `/api/health` 回 `version=0.9.35`、`database=ok`、`sourceCommit=c8186be2`。未登入正式網站做任何業務寫入。

使用者要求審查 GPT 在 V0.9.27–0.9.34 的改動，回覆「直接修」。已確認無問題的部分：build／全部測試、0023 migration 保留資料、送出後唯讀、版本鎖、權限、表單重構保留全部欄位與 Enter 行為、草稿部分輸入可存而送出時檢查。以下為修正內容，**取代**下方各段相對應的舊行為：

- **表單排版**：WO-0.9.27 過渡用的「section 內任何含 Field 的 div 都變 12 欄」規則，改為只套用在 FormSection 本身與**無 class** 的包裝層；有自己版面的列（登入「記住我／忘記密碼」、HR 津貼列、報價明細列）不再被覆蓋。欄寬 `.cy-f-s/m/l` 與 CheckField 的底部對齊也只在表單格線內生效。拜訪紀錄、常用商品、身分頁「登記系統」「安全設定」外層原本的固定欄 grid 移除，不再把整個 FormSection 擠進第一格。
- **來源選擇器**：第一層改為列出所有啟用中的非廠商來源（一般→定期→自訂，各依排序），不再寫死五個名稱，新增或改名的來源不會消失。展開但沒有可選項時按 Enter 會收合並交給表單跳到下一欄。支援 `required`：只打字沒選取時，表單檢查會提示「來源請從清單選擇」。
- **進貨輔助「加入叫貨單」**：定期中國貨必須選區段；只有同區段、同單位、未結案的同品號列才會詢問是否合併，單位不同一律新增一列。按鈕改為「取消／加入」並排在右下。
- **廠商品號記憶**（原 900ms 自動存檔會把打到一半的品號／品名寫進記憶或帶入別的品項的廠商資料）：前端只在離開欄位、Enter、切換前存檔時送 `final:true`；後端只在 final 時才用 ERP 補品名／單位、用記憶補廠商品號／品名、寫入記憶。品號或品名改掉時，原本由舊品號帶入（仍與舊記憶相同）的值會一併清掉。已存的列把廠商品號清空就是清空，不再被舊值補回。
- **後端其他**：隱藏來源時 `isActive` 必須是布林；「仍有未送出草稿內容不能隱藏」改放在同一句 UPDATE 的條件裡（原子）；已隱藏來源不能再新增明細；定期中國貨明細必須帶區段。送出時把被清空的草稿列刪掉，不完整的列會指出「區段 第 N 列」。到貨紀錄依到貨日期、待到貨清單依送出時間與排序列出（原本依隨機 id）。
- **共用回饋**：表單檢查的 `aria-invalid` 清除改用共用 handler，不再每次送出累積監聽；`replace` 只取代同標題的提醒，不會吃掉排隊中的其他錯誤。
- **清理**：移除無人使用的 `.cy-auth-remember`（改為登入選項列內的 CheckField 樣式）、`.cy-customer-related-form label.wide`、`.cy-hr-check`、`hr-phase2b.css` 的 `.cy-op-form > label.cy-hr-check`。
- **測試**：ordering-route 新增 2 項（自動存不補不記、改鍵清除帶入值、清空廠商品號；送出刪空列、列號訊息、區段必填、isActive 型別），ordering-grid 新增 2 項（final 旗標），來源選擇器新增 2 項。typecheck、build、validate:source、全部叫貨與表單測試通過；本機 harness 截圖核對登入頁、客戶／HR／身分表單、來源選單與送出錯誤訊息。
- **未做**：可攜備份仍不含叫貨資料（含 `ordering_user_preferences`），已在 TODO 由 CY Web 備份項目處理。`noValidate` 移除為設計選擇，維持。

## 2026-10-24 CYWEB V0.9.34 正式合併與受控部署結案

**使用者 2026-10-24 已明確批准「可合併部署」。已完成 PR #276 合併、原 Worker 正式發布及部署後權威稽核。以下是本版本最新權威紀錄；下方 V0.9.34 開發段落內「待審查／未部署／尚未批准」只是工作時點的歷史快照，不代表現在狀態。**

- **版本／來源**：`VERSION=0.9.34`、`BUILD=0`。PR [#276](https://github.com/simonliu1118-byte/chihyuan-web/pull/276) 由使用者授權合併至 `main`；merge SHA `b924d9891c4befb73e1f4fe326b29aadbddab03c`，審查提交 `073d507be4167c4951ce3e401d2d8eaf4498f2bd`。
- **PR 必要檢查**：對 `073d507b` 的 [Governance #39982394605](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39982394605)、[Runtime #39982394697](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39982394697)、[CY Web Deploy 契約檢查 #39982394843](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39982394843) 均 `success`。
- **正式部署**：沿用 **原本** `deploy/cyweb-development` 發布分支、environment／Worker／D1，保留原父提交 `5d5dc51748a0880f0d34e497f346b565803b8f2b`，新增受控 deploy merge commit `5af960b87eab012af2c50cd97f4b55b220a18c80`，第二 parent 為已審核 `main` merge commit；其 Git tree `cc9e779f29361f4e580a6ca47320bde075053f16` 與合併後當時 `main` 相同。**沒有 force-push／建立新 Worker、D1 或部署分支替代品。**
- **部署結果**：[CY Web Deploy GitHub Actions #40008521753](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40008521753) `validate-deployment-contract=success`、`deploy-development=success`；執行於 2026-10-24 03:04–03:06（Asia/Taipei）。Cloudflare 發布現有 `cyweb-dev` 與正式自訂網域 `https://admin.chihyuancm.com`；原 Custom Domain、workers.dev fallback、HTTPS 與部署健康驗證通過。
- **D1**：遠端 migrations log 明確顯示 `✅ No migrations to apply!`。V0.9.34 不新增 forward migration；沿用 V0.9.33 既有的 ordering schema（含 `0024`），沒有執行 Schema 變更、沒有進行人工真實業務資料操作。
- **正式 CYID 權威稽核**：production audit 確認 `canonicalProductionProviderVerified=true`、`portalUsesCanonicalProductionIdentity=true`、`productionPortalReady=true`、`healthMatchesRuntime=true`、`identityDatabasesSeparated=true`、`failureCode=null`、`mutationPerformed=false`。
- **本輪已發行內容**：不完整明細草稿在 D1 保存、停打 900ms／blur／Enter／flush／手動儲存；正式送出仍須完整品名與數量，空白 phantom row 不存；共用兩層可打字搜尋來源選擇器（含中國貨來源）、進貨輔助加入叫貨單防誤關閉及單位欄位、左側日期與來源篩選修正、共用 Loading、已隱藏來源列表與恢復操作，以及預設單行／隨內容增高的文字輸入區。
- **未完成項目／風險**：部署與自動測試通過**不等於有權限帳號的人員已完成 UI 驗收**。Claude／使用者後續仍需實機檢查：只填品號的未完成草稿停打或失焦後重開仍在；連續輸入＋切來源不漏寫／不複製列；無效草稿擋送出；兩類中國貨專屬區段與進貨輔助新增操作；雙層搜尋與行動版位置；單位／隱藏恢復／歷史來源篩選；不可在正式站為了測試而重送到貨或建立未授權的真實訂單。
- **文件整合**：下方 V0.9.33 的開發階段段落亦有歷史「未合併／未部署」字樣，請以下兩節正式結案優先；另有文件整理 PR #273 時，後續合併 `TODO.md` 要保留 V0.9.34 結案更新，不得覆蓋。


## V0.9.34 — GPT 第二輪叫貨介面與草稿儲存修正（2026-10-23，待審查／未部署）

使用者同意本輪直接實作，但**尚未批准本 PR 合併或正式部署**。以當時最新 `main` `0da4d35a0d9b92e415b3e1fc524dd2443678c16c` 開分支 `cyweb/fix-ordering-draft-save-picker-20261023`；版本預計 V0.9.34。與上節 V0.9.33 已部署結案區分，正式站仍為已發布版本。

### 使用者需求及本輪處理
- 進貨輔助「加入叫貨單」：`AddToOrdering` 專用 Dialog `dismissible={false}`，不接受 backdrop／Esc／右上 X 關閉，保留「取消」及加入成功後離開。新增自由填寫的單位，沿用 `ordering_lines.unit`，10 字限制。
- 新共用 `OrderingSourcePicker`：一邊打字搜尋或按按鈕展開；第一層固定台北／台中／洲美／定期中國貨／自訂中國貨／廠商，按廠商進第二層選外部廠商。相同元件用於加入叫貨單與左側歷史來源篩選；歷史篩選可查被隱藏來源，新增只可選 active。移除原 RestockAssist 對 `CN_REGULAR`／`CN_CUSTOM` 的排除過濾，後端保留原來 CN_REGULAR 分區與 CN_CUSTOM 欄位契約。
- 明細草稿長期顯示「尚未儲存」的確定原因：舊 `OrderingGrid.canSave` 要求品號／名稱和數量都已填才呼叫寫入，`commitNew` 缺欄位便直接返回；只有 blur／Enter 時才嘗試提交，沒有停打自動送。後端也曾對 draft 明細數量與名稱做與正式送出相同的驗證。
- 本輪允許具有任一內容（例如只有 A00302 品號）的**不完整草稿行**儲存到原 D1，禁止儲存完全空白的 phantom row；只有正式 `/send` 仍嚴格驗證必填品名／數量。前端停打約 900ms 或 blur／Enter、切換前 flush 即儲存；新增「儲存草稿」手動保險按鈕、單據頁首備註／日期停打自動儲存。成功必須收到實際 API ack 才呈現「已儲存」，失敗保留草稿。
- 品名／廠商品名／備註輸入區預設單行高 34px，文字內容需要時才自動長高，最多 176px 並可欄內捲動；不是一開始佔兩列。
- 共用 `Loading` 轉圈圈用於讀取草稿及廠商 overview。點廠商先切頁籤／載入畫面，待資料回來才顯示；使用既有 `loadSequence` 防過期請求覆寫。
- 左側來源與日期改為各佔一整列，避免篩選器與日期字被截；「管理來源」有清楚的「查看已隱藏來源（N）」入口，另開清單可恢復，不硬刪歷史來源。
- 新增／更新 route、grid、page 回歸測試；所有變更都只限 CYWEB 叫貨／進貨輔助 UI、既有 ordering API 校驗，沒有新 Worker、D1、Migration 或 CI workflow。

### GitHub PR 與自動驗證結果（同日）
- [PR #276](https://github.com/simonliu1118-byte/chihyuan-web/pull/276)，最新驗證工作提交 `6f6a97841836552d9ad166553fdaf58e6163b457`。
- [Governance Check #39981885588](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39981885588)：success。
- [Runtime Check #39981885608](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39981885608)：success，含 Worker、browser TS、local D1 與新增 source picker UI 互動測試。
- [CY Web Deploy #39981885629](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39981885629)：**PR 契約驗證 success，並非正式 Worker 部署**。
- 首次 CI 找到舊中國貨測試認定部分草稿不可存的過時預期，已修正測試，最新 run 全通過。尚未合併、未部署；正式登入後的 UI／資料驗收仍需進行。

### 審查及正式驗收注意
- **必測**：只有品號的未完成草稿→離欄位/停打→重新載入仍存在；填完後才允許送出；不允許空白列；連續快速輸入多欄保留最新版本且不重複建立；儲存失敗保留資料；中國貨兩類加入叫貨後分區正確。
- 來源篩選是 sourceId，**「廠商」是第二層入口，非實際來源**；歷史清單須能查隱藏來源，新增不能用已隱藏來源；單位須隨新增／同品項追加正常保存。
- 未經使用者再批准，不合併、不部署、不對正式業務 D1 實際重送測試訂單。PR CI 僅證明自動驗證，不等於真人視覺驗收。


## 2026-10-23 V0.9.33 正式合併／部署結案（本輪最新狀態，優先於下方開發階段紀錄）

**使用者已於 2026-10-23 明確批准合併並部署。已完成 PR #274 合併、原本正式 CYWEB Worker／D1 受控更新及部署後權威稽核。本節為當前事實，下方「尚未合併或部署」僅保留作實作階段的歷史快照，不再代表目前狀態。**

- GitHub PR：[ #274 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/274)，於本輪使用者批准後合併到 `main`；merge commit `4acf533d1d65800b77b6ada60592f275375f09ce`。正式產品版本 `V0.9.33`、`BUILD=0`。
- 合併前該 PR head `67460874e0bc4f52b087e325a631b47d1fe1a02a` 的 Runtime Check `#39949709448`、Governance Check `#39949709468`、CY Web Deploy 契約檢查 `#39949709505` 均通過。
- **正式發布**：沿用 `deploy/cyweb-development` 的既有受控發布入口，以具雙 parent 的非強制更新 `5d5dc51748a0880f0d34e497f346b565803b8f2b` 保留原部署 ancestry，並納入完整 `main` merge commit。新發布 commit 的 Git tree `ce733514365503ed55356643a106966e6d8736a9` 與合併後當時的 `main` tree 完全一致；未 force-push／未新建 Worker 或業務 D1。
- [正式部署 GitHub Actions #39957226382](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39957226382)：`validate-deployment-contract`、`deploy-development` 均 **success**。部署時間約 2026-10-23 20:58（Asia/Taipei）。`Verify current reviewed main before remote changes`、原受控備份／復原目標準備、Build、Worker 發布等所有實際執行的發佈步驟皆成功。
- **正式 D1 forward migration**：部署輸出明確列出 `0024_ordering_source_preferences.sql` 且狀態 **✅**（僅 1 項新 migration）。在既有資料庫原位加上 `ordering_sources.payment_terms` 與 `ordering_user_preferences`；沒有移除原始來源或歷史訂單表。部署後的 D1 health/source consumer declaration 驗證通過；未手動寫入或更動其他 D1。
- **入口與權威驗證**：正式 Custom Domain、workers.dev fallback、HTTPS／靜態資源、daily catalog schedule 驗證均通過。發布後 production Identity audit 回報 `productionPortalReady=true`、`canonicalProductionProviderVerified=true`、`portalUsesCanonicalProductionIdentity=true`、`healthMatchesRuntime=true`、`failureCode=null`、`mutationPerformed=false`。無新增測試 Worker、D1 或身分服務。
- **資料安全／功能邊界**：本次為叫貨 UI／來源付款條件／個人頁籤順序更新；原到貨 POST／送出版本鎖、特殊中國貨邏輯、CYID contract 及其他模組維持原邊界。隱藏是 soft-hide，並阻擋有內容的未送出草稿被隱藏；沒有硬刪來源或歷史單。無從 CI 宣告真實業務資料的人工逐筆核對，且尚未以實際有權限帳號完成桌面／手機畫面手動驗收；如 Claude 後續接手，請優先核對來源隱藏／恢復、個人頁籤排序跨裝置、長文字折行和表格到貨操作，不要未經使用者核准就重送到貨造成重複計數。
- **文件整理提醒**：另有尚待處理的文件整理 PR #273，可能同樣修改 `TODO.md`；該 PR 之後合併時須與本輪 V0.9.33 紀錄整合，勿用過時 TODO 覆蓋最新結案狀態。


## 本輪 GPT 交付：V0.9.33 — 叫貨明細、到貨、廠商頁籤與來源管理介面調整（2026-10-23）

使用者已核准直接實作；本輪以主線 V0.9.32 Build 1 為基礎，新增獨立 `cyweb/ordering-ui-sources-tabs` 分支。**尚未合併或部署**；原正式資料與 Cloudflare 不動。純介面與必要小範圍 source/settings 資料層修改，無關 CYID、ERP 與其他模組不動。

- `OrderingGrid.tsx`：已送出唯讀表格的品名／廠商品名／備註可完全折行，不再用省略號；備註保持主文字色。數量不再跟綠勾或警示三角擠在一起，獨立狀態欄以文字標籤呈現（待到貨、部分到貨、已到貨、已結掉等）；欄寬縮小兩個名稱欄的剩餘比例、加寬廠商品號。
- `OrderingPage.tsx`：到貨 Dialog 沿用與叫貨明細相同的表格視覺；只顯示尚未到齊、未結掉、有效可計算數量的品項，不改既有到貨 payload、版本鎖或寫入流程。
- 原廠商草稿的垂直卡片改為單一編輯表格＋可搜尋的橫向頁籤。廠商不顯示項數；「其他」固定最右，不參與個人排序。切換頁籤前沿用 `prepareSwitch()` 保存/確認未儲存資料。可拖曳排序，也有鍵盤可點的左／右移動按鈕。叫貨條件與付款條件在頁籤內容上方顯示。
- 管理來源改為緊湊表格：名稱、類型（只顯示公司內部／外部廠商）、叫貨條件、付款條件，以及修改／共用排序／隱藏或恢復；停用改稱隱藏，不刪除歷史單據。原 `CN_REGULAR/CN_CUSTOM` 仍在 DB 保留類型與專用邏輯，避免 UI 合併分類時破壞既有業務流程。
- 新 `migrations/0024_ordering_source_preferences.sql` 為 forward migration：`ordering_sources.payment_terms` 自填文本、`ordering_user_preferences`（app member FK）保存個人廠商順序。共享 `ordering_sources.sort_order` 只用於管理來源的預設排序；個人喜好使用獨立受權保護的 API `/preferences/vendors`，換裝置登入可保留，不寫 LocalStorage。
- `ordering-routes.ts`：`paymentTerms` 加入來源 GET/POST/PATCH，來源 `is_active` 沿用隱藏／恢復；`POST /sources/reorder` 原子批次更新共用排序；`GET/PUT /preferences/vendors` 保存認證會員的個人順序並核對每個來源有效，均需原模組權限。Audit 僅寫入來源類型／欄位或排序摘要，不紀錄敏感帳密。
- **隱藏安全閘**：來源若仍有已填內容／單據備註的未送出草稿，API 會拒絕隱藏，避免草稿從頁籤消失無法操作；送出／清空後才能隱藏。原來的歷史單與到貨紀錄仍保留，恢復沿用原始來源 ID。
- 測試調整：新增來源付款、個人排序、共用排序、未送出草稿防隱藏及歷史保存的 route regression；原 `ordering-grid` status icon 斷言改為文字標籤，且覆蓋 editable multiline／Enter 流程；`ordering-page` 增加到貨 Dialog 排除已到齊與廠商可搜尋頁籤／其他固定顯示。最終 CI 與正式部署狀態以 PR #274 Actions、部署交接記錄為準；本 PR 仍未合併或部署。

**後續 Claude 審查點**：新 migration 需依既有 D1 受控發布，確認現有資料 `payment_terms` 的 default 保持空字串、個人排序只認目前登入的 app member、隱藏來源不能新增單但歷史叫貨依舊可讀；不直接刪除來源。若發現 UI 需要更改來源種類語意、特殊中國貨訂貨邏輯或廠商主檔連動，屬另案，應先確認使用者需求，不要藉本輪擴大範圍。

更新日期：2026-10-23。此文件依使用者「專案主要由 Claude 處理，必須開 handoff 註明修改」要求建立。這是直接交辦修正的交接紀錄；共通規則仍以既有治理鏈為準。維護狀態入口為根目錄 `TODO.md`。

## 最新交付：V0.9.32 Build 1 — 到貨表格、合併狀態與送出唯讀（2026-10-23）

使用者在前一輪到貨故障正式驗收完成後，另行交辦本項介面／流程調整，故 Patch 升至 0.9.32。第一次交付後依使用者回饋加寬品名／廠商品名，三個數量欄各 76px、本次到貨 96px，剩餘寬度分配給兩個品名欄；同一項返修 Build 增為 1。不是 0.9.31 GLOB 修正返修。使用者已明確授權本輪合併並部署原網站；實際部署結果須以收尾紀錄為準。

- `OrderingPage.tsx`：到貨 Dialog 改用共用表格樣式、Field／CheckField／RequiredRows；表頭只有單號與原生日期，品項逐列顯示。勾選者可輸入數量，預設剩餘量；由 selected IDs 產生完整多列 payload，防止選了顯示預設值卻未實際放入 quantities map 的品項遺漏，0／無效數量明確中文拒絕。
- 有紀錄的「到貨紀錄」移到單據標題後最上方；空的完全不渲染。獨立到貨狀態表取消，`OrderingGrid` 同一表加入已到數量；全到綠勾／部分到黃色三角驚嘆號位於數量格，附中文 aria-label／tooltip。結掉原因保留顯示，結掉剩餘仍從未到貨清單操作。
- `OrderingGrid.tsx`：draft／readonly presentation 共用同一欄位模型。送出或作廢後只渲染文字，無 input、尾列或操作欄；草稿仍可直接輸入並按七欄 Enter。只留下垃圾桶 IconButton，刪除經原確認及 action-save／flush；沒有上移／下移或第二層選單。
- 空白暫存列包含輸入後清空時，不計 dirty、不送 API、不阻擋 flush。實際有內容的未完成列及失敗輸入仍保留；原新列確認、晚到回應、序列寫入與自動儲存狀態不變。
- `ordering-routes.ts`：送出後禁止 header PATCH 及 line save／insert／delete／reorder，中文 409 拒絕且不寫資料／Audit；避免僅把前端停用而舊頁籤仍可改。保留原版本鎖與到貨、結掉剩餘、作廢權限及寫入流程。這是使用者最新決定，取代早期送出後可直接改明細的設計。
- `IconButton.tsx`：icon prop 從 string 放寬為 ReactNode 以重用既有按鈕顯示線條 SVG；現有 string 呼叫相容，標示／tooltip／尺寸規則不變。CSS 只新增叫貨 scope，使用既有淺／深色 tokens；到貨視窗桌面最大 1120px，窄版表格區水平捲動。

驗證：本機 `node --test scripts/ordering.test.mjs scripts/ordering-route.test.mjs scripts/form-keyboard.test.mjs scripts/form-fields.test.mjs` **52 項全數通過**，`npm run build`（含 browser／Worker typecheck）及 `npm run validate:source` 通過。新增案例包含空尾列清空、唯讀無輸入／尾列、到貨紀錄順序及隱藏、多列預設到貨量、零數量拒絕，以及送出後所有內容寫入拒絕；原多次／多品項到貨與 committed-readback-failure 案例持續通過。Build 僅原有 bundle 大小／dynamic import 提示。遠端 CI 與部署現況依 PR 及根 TODO，不把本機驗證等同正式發布。

本機實際瀏覽器畫面（全部合成資料，非正式資料）：[草稿刪除圖示](images/ordering-receipt-table/draft-delete.png)、[送出後唯讀與到貨狀態](images/ordering-receipt-table/sent-readonly.png)、[到貨表格多選](images/ordering-receipt-table/receipt-table.png)。已目視核對欄位完整、綠勾／黃色警告、送出無輸入與尾列、勾選後數量欄啟用；空尾列備註 Enter 聚焦下一列品號且仍為已儲存。API persistence 由本機 SQLite 路由測試負責；UI harness 不連正式後端。

本輪無 migration／新增查詢／正式資料搬移或清除；執行者未直接查詢或修改正式業務資料。沒有變更 CYID／ERP／其他業務模組、部署設定或前次 0023。使用者已直接批准本輪合併部署，以下為實際結果，供 Claude 接續維護。

### V0.9.32 Build 1 正式發布紀錄

- [PR #271](https://github.com/simonliu1118-byte/chihyuan-web/pull/271) 更新 head `78d535a2f91ed9087516aaffff468773fea52c39` 的 [Governance #39919478095](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39919478095)、[Runtime #39919478036](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39919478036) 與 [部署契約 #39919478111](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39919478111) 全數成功；合併及正式部署來源為 `d219a89e709f667f19c957b23e37463db846290c`。
- 使用者回饋欄寬後，只調整 colgroup、叫貨 scoped CSS、Build 與交接，不重改商務邏輯。實際瀏覽器在 1082px 表格量得兩個品名欄各 262px，叫貨／已到／剩餘各 76px，本次到貨 96px；文字欄分配剩餘空間，窄版維持表格內橫向捲動。更新後 typecheck／build 與 diff check 通過，合成截圖已替換。
- 沿用 `development-deploy.yml`／`main` 的 `deploy-development` 發布原網站。[部署 #39919678240](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39919678240) 的 Worker 發布、來源／D1 health、每日排程、HTTPS／靜態資源、Custom Domain 與無效 Session 檢查均通過；最後 `Require canonical production portal authority after deployment` 因 `CYWEB_AUDIT_SNAPSHOT_CHANGED` 失敗，故**原 workflow conclusion 仍為 failure**。不得把 Worker 已發布誤寫為整個 run 全綠，也未繞過或移除該保護。
- 未重新部署、未更動帳號 authority 或 D1。改用既有 `audit-identity` operation 作獨立唯讀核對：[稽核 #39920079780](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39920079780) 成功，實際 report 為 `productionPortalReady=true`、`failureCode=null`、`mutationPerformed=false`；provider／DB 隔離、正式 Identity 綁定、workspace／application、health 與 consumer `1.0.5` 均通過。原快照變動告警保留可追溯，當前正式拓樸已重新確認。
- 正式 `/api/health` 獨立回讀為版本 `0.9.32`、`database=ok`、上述來源 SHA；Cloudflare MCP 唯讀回讀同一來源與版本，`logs.enabled`／`invocation_logs`／`persist` 皆為 true。新版 UI 的檢查使用前述本機合成畫面；沒有擅自新增正式到貨或其他交易來驗收。
- 無新 migration、Worker／D1／workflow／GitHub Release，未重寫部署分支。執行者直接正式 SQL／業務資料寫入 0 列；額外使用既有平台部署 1 次、唯讀稽核 1 次、Worker settings GET 1 次及公開 health GET 1 次，沒有遠端批次整理、資料匯出或遙測全表掃描。文件收尾合併後不重部署。

## 已發布交付：V0.9.31 Build 1 — 正式部署與到貨驗收完成（2026-10-23）

本段取代下方歷史階段的「待診斷／待合併／待部署」狀態。此輪接續既有 #269，未重做功能或建立重複修正 PR；僅在完成後補本文件及 TODO。正式基礎設施識別資訊、復原書籤、業務資料及詳細核對結果保留在執行工作區的 private 目錄，不提交 Public Git。

### 發布與安全核對

- [PR #269](https://github.com/simonliu1118-byte/chihyuan-web/pull/269) 核對 head `7c1f353b4e22f4aac5e0b6102ede4691c477a803`，必要 CI 全數成功；原始 check-runs 確認 build 已完成，未依過期的 pending 顯示判斷。合併提交及部署來源：`7d67d10d15e45bedadb9df1f32284090037b52a3`。
- 使用者直接批准正式部署後，沿用 `development-deploy.yml` 的 `main`／`deploy-development`；[部署 #39913713939](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39913713939) 全部成功，2026-10-23 約 14:49（臺灣時間）完成發布。未 force-push 部署分支、未另建 Workflow／Worker／D1，原 DB 與既有隔離復原 DB binding 保持一致；無 GitHub Release。
- 部署前由 Worker `DB` binding 解析原正式 D1；確認只到 0022、原長 GLOB CHECK 仍在、無其他表額外引用到貨主檔。到貨主／明細均 0 筆，原問題單也沒有已提交卻未顯示的紀錄；全庫 foreign-key check 正常。
- Time Travel 可讀取當前復原書籤，既有 R2／GCS 備份目錄有 verified 紀錄；雲端 D1 匯出已完成。完整正式備份下載到本機被自動審查拒絕，未執行，亦未進行該份完整資料的本機還原演練；發布依據是雲端復原點、正式空到貨表的核對與合成資料 migration 保留測試，不宣稱已演練正式還原。既有自動備份排程未啟用，這次未變更。
- 僅 `0023_ordering_receipt_d1_glob.sql` 待套用，正式流程成功執行 14 個命令，約 21.22 ms；D1 migration 目錄回讀確認 0023 已套用。未手改正式 Schema。
- 部署前後到貨主／明細均 **0 → 0**；原叫貨資料的筆數及數量彙總一致。新表使用短 GLOB、三個原索引完整，receipt-line FK 正確指向原表名，無 `_new` 殘表，foreign-key check 無異常。正式 D1 以純 SELECT 驗證新 CHECK：合法格式通過、含非數字／過短／過長格式拒絕；未為測試新增正式交易。
- 正式 `/api/health` 回報 `database=ok`、`version=0.9.31`、consumer `1.0.5` 與上述來源 SHA；Actions 的 HTTPS／靜態資源／Custom Domain／無效 Session／CYID production authority 驗證均通過。
- Cloudflare 設定回讀確認 `logs.enabled=true`、`invocation_logs=true`、`persist=true`。新 Worker version 發布後至 14:52:30 的短觀察窗有 **29** 個事件，GLOB 錯誤比對 **0**；此觀察窗早於下述使用者正式驗收，不把「沒有錯誤」單獨當成功證明。

### 正式功能驗收

- 使用者在更新後自行操作原本的正常到貨流程，確認「**已成功，重整後紀錄與數量都正確**」。涵蓋儲存、重載持久性及未到貨數量扣減。
- 隨後 MCP 唯讀回查確認 **1 筆到貨主檔、8 筆明細**，本次發布後相應 **1 筆 `ordering.received` Audit 與 1 筆修訂紀錄**；主檔無孤兒，明細無孤兒或跨單關聯。資料增加來自使用者正常業務操作；執行者未新增測試交易、未清除或覆寫正式資料，也未重送使用者的請求。
- 原「叫貨操作失敗／GLOB pattern too complex」故障本輪已修復並完成正式驗收；不是只以部署成功結案。未額外宣稱其他來源、跨日或併發到貨皆已由使用者驗收。

### 驗證與實際資源量

- 本機 `PYTHONUTF8=1` 執行 schema validator：23 migrations、92 tables、10 組檢查通過，包含強制 50-byte pattern limit、歷史主明細逐列保留、FK 及新舊合法性驗證。43 項叫貨／路由／表格回歸通過，含多品項到貨及寫入後讀回失敗保護。
- Windows 的完整 deploy-config validator 在既有 POSIX `0600` 權限斷言失敗；本機第一次測試另遇沙箱依賴路徑讀取限制，解除後 43 項全過。部署設定／local D1／build／dry-run 以本次 Linux PR CI 及正式 workflow 全部成功為驗證依據，未為 Windows 平台差異修改產品。
- MCP 直接 D1 核對共 **5 批、22 個唯讀 SQL／PRAGMA**，服務 metadata 累計 **2,956 rows read／0 rows written**，低於原預估 1 萬列。正式 migration 另計 **14 個命令**、到貨資料搬移 **0 列**；Schema／migration bookkeeping 的平台列寫入數未由 workflow 摘要提供，不將其混稱為 0。使用者驗收新增資料另計，不算執行者測試寫入。
- 另有一次雲端 SQL 匯出（兩次 polling 呼叫），資料庫配置大小約 1.1 MB；未下載完整正式資料。遙測核對為指定新版、約 3 分鐘窗的 **2 次彙總查詢**；Observability 服務回報內部掃描共 **6,449,195 列／296,173,328 bytes**，與 D1 rows-read 計量不同。掃描量高於小型彙總直覺，取得結果即停止，不進行持續輪詢；這不是 D1 每日資料讀取量。上述摘要不含正式 ERP 單號、帳號、品項或 infrastructure ID。

本故障收尾沒有待補的部署／到貨成功閘門。其他模組及既有手機版／備份功能待辦依根 TODO 另案維護。

## 根因確認與修正：V0.9.31 Build 1 — D1 到貨 GLOB 限制（2026-10-23）

使用者於正式站 `POST /api/business/ordering/orders/1/receipts` 取得 Cloudflare Workers Logs：`phase=persist`、`errorName=Error`、`D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR`。Cloudflare D1 官方平台上限是 **LIKE/GLOB pattern 50 bytes**；`migrations/0022_ordering.sql` 中 `ordering_receipts.erp_purchase_no` 使用 `341A-` + 11 組 `[0-9]`，共 **60 bytes**，使正式 D1 INSERT 被 CHECK 評估阻斷；本機預設 SQLite 上限高，原測試未覆蓋。不可將原 0022 當作未套用 migration 修改。

- 新增 `migrations/0023_ordering_receipt_d1_glob.sql`：將 60-byte CHECK 改為 `length(erp_purchase_no)=16 AND substr(...)= '341A-' AND substr(...,6) NOT GLOB '*[^0-9]*'`。建立新主檔及新明細表、先複製既有主檔及明細、先刪舊明細再刪舊主檔、重新命名及建立原索引；原始 PK、外鍵、到貨日期 CHECK 均保留。防範 Cloudflare `defer_foreign_keys` 無法停用 `ON DELETE CASCADE` 導致誤刪歷史。
- `scripts/validate_schema.py`：先用舊 Schema 插入歷史資料，再強制 SQLite `SQLITE_LIMIT_LIKE_PATTERN_LENGTH=50` 重現舊版 INSERT 錯誤；在同一交易測試 0023，核對歷史主檔／明細逐列一致、外鍵完整、正常 ERP 單號可寫入，非法單號仍被拒。
- 不修改 ERP 單號上層解析器及 Worker 商務流程、不更動實際 ERP／Cloudflare 服務綁定、不直接操作正式業務資料。本輪與既有 Workers Logs persistence 設定合併到同一 PR，遵守同一故障返修 Build 1。

**發布安全閘**：需 PR 全部 CI（包括 schema source validation、D1 local、deploy dry-run）通過、先確認正式 D1 備份／Time Travel 狀態，才可按專案既有發布流程套用 0023；migration 是正式業務資料 Schema 變更，勿在 PR 測試使用正式 D1。部署後先核對舊到貨紀錄，再用正常業務流程測試一次；請求編號、原始錯誤與業務欄位不得加入 Public Git。
## 部署前歷史：V0.9.31 Build 1 — Cloudflare Workers Logs 與 GitHub Wrangler 設定同步（2026-10-23）

- 使用者在 Cloudflare Dashboard 已自行啟用 `cyweb-dev` 的 Workers Observability Logs，並觀察到 `[ordering_receipt_failure]` 及到貨 POST 失敗事件。螢幕截圖僅顯示 Events 列表；尚未取得事件中的 `phase`、`errorName`、`errorMessage`，**不能根據此圖宣稱定位到 D1 根因**。
- 原 `wrangler.deploy.template.jsonc` 未包含 `observability`，日後 GitHub Actions 部署可能覆蓋 Dashboard 設定；此輪新增 `observability.logs.enabled=true` 與 `observability.logs.invocation_logs=true`，保留預設日誌持久化行為，與使用者在 Dashboard 上啟用的設定保持一致。
- `scripts/validate-deploy-config.mjs` 對實際產生的 Wrangler JSON 增加安全閘門，CI 與正式部署前要求兩個設定皆為 `true`；不修改業務 Worker、D1 Schema、ERP、CI Workflow 或增加 Cloudflare 資源。
- 本輪為前次 V0.9.31 到貨診斷未完成事項的同一工作項目返修，BUILD 由 0 調整為 1；版本維持 V0.9.31，不新增 Major/Minor。
- 部署／交接：使用者已在 Cloudflare Dashboard 啟用日誌。此 GitHub 設定變更仍需 PR 通過、合併、由既有受控發布流程正式部署，**提交 PR 本身不等於部署**。若準備排查當次錯誤，請在 Events 展開 `[ordering_receipt_failure]`，核對 `phase`、`errorName`、`errorMessage`；避免將實際 ERP 單號／交易明細貼入公開 GitHub。
## 歷史交接：V0.9.31 Build 0 — 到貨診斷（2026-10-22）

使用者實機出現「叫貨操作失敗」，原 Worker catch 區統一回傳 500 而未輸出原始例外。到貨 D1 batch 成功後仍會重新讀取單據，讀回出錯時原先會把已提交的結果誤判為儲存失敗。目前沒有正式 Worker log，**不可斷言原始 D1 根因**。

- `worker/http/ordering-routes.ts`：POST receipts 加入 preflight／persist／readback 階段；未知例外以 `[ordering_receipt_failure]` 記錄 requestId、階段、例外名稱及截斷訊息，禁止主動寫入 ERP 單號、品項與帳號資訊；已提交後讀回失敗回 `ORDERING_RECEIPT_CONFIRMATION_REQUIRED`（503），不再當成整筆未寫入。
- `src/runtime/modules/OrderingPage.tsx`：結果不明保留到貨 Dialog，不自動重送；提示附 requestId 供 Worker log 對應。
- `scripts/ordering-route.test.mjs`：驗證交易已成功但回讀失敗的診斷結果與資料保留，以及驗證失敗時資料未寫入。
- `VERSION`／`package.json`／`TODO.md`／架構文件更新；不增加 D1 migration、權限、ERP 查詢或其他模組功能。

**驗證交接**：容器無法解析 GitHub DNS，未能取得完整本機 checkout 執行 Node／SQLite；需以 PR CI 的 typecheck、build、ordering tests、validate:source 正式確認後才可合併。部署後用畫面 requestId 對應 Worker log 與 phase 判定根因，並先核對是否已有到貨紀錄再決定重試。本輪正式 D1 讀寫 0 列，未合併或部署。

## 最新交付：V0.9.30 Build 0（桌面表格與儲存狀態）

使用者已核准叫貨桌面預覽，並明確修正：格子本身直接可輸入，不是切換顯示／編輯模式；Enter 必須完整逐格，取消舊數量捷徑。另要求預設未到貨、移除明細下方兩行，以及原標題下自動儲存位置顯示轉圈儲存中／已儲存／紅字儲存失敗。

| 檔案 | 本輪修改 |
|---|---|
| `src/ui/OrderingGrid.tsx` | 所有 input 持續掛載，使用獨立表格樣式；colgroup 依內容配寬，列操作收成 `⋮`，重用共用 Dialog。數量 Enter 改到單位，其餘按實際欄序，備註到下一列品號。移除底部狀態／常駐說明；回報 dirty/saving/failed，列操作也納入等待。原 row key、API 確認、失敗保留及 flush/discard 保護延續 |
| `src/runtime/modules/erp-item-query.css` | 僅叫貨專用格線、透明無框儲存格、細焦點框、欄寬與 34px 列高；窄版觸控 44px，沿用原色彩 tokens。失敗狀態使用 danger token 紅字；spinner 重用共用動畫 |
| `src/runtime/modules/OrderingPage.tsx` | 預設未到貨且來源不預選；狀態集中於原日期／品項數那行。表頭儲存計數、失敗紅字、編輯修訂計數，避免舊回應清掉等待期間新輸入的 dirty 狀態；自動存表頭不另冒綠色已儲存 banner |
| `scripts/ordering-grid.test.mjs` | 四種來源在新列／已存列的完整 Enter 順序、取消數量捷徑、列操作參與儲存狀態與 flush，原換列／儲存保留案例持續驗證 |
| `scripts/ordering-page.test.mjs` | 預設未到貨、零草稿請求；狀態 spinner／失敗／未儲存／完成，表頭失敗重試與舊回應不誤判完成 |
| `VERSION`／`package.json`／`TODO.md`／架構文件 | 0.9.30，BUILD 仍為 0，更新 current contract 與交接 |

一般／廠商 Enter：**品號 → 品名 → 廠商品號 → 廠商品名 → 數量 → 單位 → 備註 → 下一列品號**。這項明確取代下方 V0.9.28／0.9.29 歷史紀錄中「保留數量快捷操作」；IME、廠商品名＋數量可儲存並送出、我方欄位不複製、樂觀鎖等規則不變。

本輪沒有修改 Worker／API／schema／權限、其他模組或共用主題。手機三欄表格＋完整表單仍是未核准實作的後續方案，現行窄版保留表格區水平捲動。本次直接交辦，不是 Claude→GPT 工作單。

驗證／部署狀態：

- [x] 本機瀏覽器以實際 OrderingPage／OrderingGrid 與合成 transport 操作：完整七欄 Enter 到下一列、轉圈儲存中、失敗紅字＋輸入保留、重試完成、重開模組預設未到貨、再開來源仍保留新增整列及補填備註；已查看淺／深色畫面。這是本機 UI smoke，後端 persistence 另由 in-memory SQLite 路由測試負責，不宣稱正式帳號驗收。
- [x] 最終 `node --test scripts/ordering.test.mjs scripts/ordering-route.test.mjs scripts/form-keyboard.test.mjs`：43 項通過；`npm run build`、`npm run validate:source` 通過（build 僅既有 bundle 大小／動態 import 提示）。
- 本機實際畫面：[預設未到貨](images/ordering-compact-table/default-pending.png)、[緊湊表格與焦點](images/ordering-compact-table/compact-table.png)、[儲存失敗紅字](images/ordering-compact-table/save-failed.png)。皆為合成資料；非 AI 預覽，也非正式站資料。
- [x] [PR #265](https://github.com/simonliu1118-byte/chihyuan-web/pull/265) 已合併：修正提交 `3f05a8c6d167faf6399bf91228d0471520a7b56d`，主線來源 `b75b9ac941f0cc7b167918226d8ace77142a87a9`。
- [x] [Runtime Check #39631359103](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631359103)、[Governance #39631359027](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631359027)、[部署契約 #39631359047](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631359047) 必要檢查全部成功。
- [x] 原網站 [部署 #39631658692](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631658692) 成功，來源 `main` 的 `b75b9ac941f0cc7b167918226d8ace77142a87a9`。已部署版本／consumer 宣告與 D1 健康、HTTPS／靜態資源、正式網域、無效 session 及 Identity 權威檢查全部成功。未建立 GitHub Release。
- 部署後僅補交接／TODO 證據，不修改功能、版本或部署設定，不需為本文件重部署。Claude 後續可直接閱讀此最新交付段落與根 TODO。
- 正式業務資料讀寫 **0 列**；本機合成請求與圖片均不含真實業務帳號／交易資料。無 migration 或遠端批次資料作業。

## 使用者確認的範圍

1. 備註按 Enter 應立即建立下一列並聚焦品號，不能在第一列循環。
2. 修正只填廠商品號／廠商品名／數量時未真正儲存，切走再回來資料消失，以及草稿載入過久。
3. 使用者明確定案：一般／廠商來源可用「廠商品名＋數量」儲存**及送出**，我方品號／品名可留空；不得把廠商品名複製到我方品名充作通過驗證。
4. 使用者另詢問叫貨明細改 ListView／表單的方案，先盤點再核准桌面預覽；實作與後續澄清見最上方 V0.9.30。

## 已交付的上一輪：V0.9.28 Build 0

- `OrderingGrid` 備註 Enter 改用最新草稿列清單；沒有下一列時立即新增，不等待 API 成功，也不因該列缺必填值而停在原列。
- 保留原數量 Enter 快捷操作、IME 行為與其餘畫面。
- 功能 [PR #260](https://github.com/simonliu1118-byte/chihyuan-web/pull/260)，後補部署證據 [PR #261](https://github.com/simonliu1118-byte/chihyuan-web/pull/261)。
- 已部署來源：`32c69ce1245519720a4a8e180c3fe519528c39bf`；[部署 #39619928512](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39619928512) 成功。本機相關測試 24 項、build、validate:source 通過。

## 本輪：V0.9.29 Build 0

### 根因

- 前端新列 eligibility 僅認我方品名／品號＋數量；只填廠商欄位時直接跳過提交，沒有真正呼叫儲存。
- 後端儲存及送出也要求我方品名，需與使用者新定案一致。
- 新列建立請求送出後，若再填單位／備註，舊流程可能直接清掉暫存列；切換來源也沒有明細 flush／未儲存確認。
- 開啟草稿後重查來源、歷史、未到貨，新建還重讀草稿列表；逐格儲存重複全區 refresh。初次歷史查詢又與搜尋 effect 重疊。後端草稿詳情重查單據並讀取不適用的到貨及修訂資料。

### 修改責任與位置

| 檔案 | 修改 |
|---|---|
| `shared/ordering.ts` | `orderingLineHasName` 統一一般／廠商的擇一品名規則；未到貨資料帶獨立 `vendorItemName` |
| `worker/http/ordering-routes.ts` | 儲存及送出採用新規則；成功附 `savedLineId`，新列產生 52-bit 安全整數 ID；保留版本鎖／稽核／交易。草稿略過到貨及修訂查詢，GET 不重查單據。搜尋納入廠商品名／品號；未到貨／稽核保留可識別的廠商品名 |
| `src/ui/OrderingGrid.tsx` | 等儲存確認才清除暫存；等待中補填欄位更新至同一個明細 ID；失敗保留並能重試。確認後保留同一 React row key，避免伺服器 ID 替換時重新建立輸入控制；延後的焦點操作能解析該 ID。提供 editor `flush/discard` 及 dirty/saving 狀態，中文儲存狀態。保留上一輪 Enter 修正 |
| `src/runtime/modules/OrderingPage.tsx` | 切換／送出／匯出前 flush、未完整則確認；套用共用離開保護。移除草稿路徑多餘 refresh，直接使用寫入回應與快取版本；來源切換用序號忽略過期載入。廠商增修／刪除同步當組與快取，不重查全畫面 |
| `scripts/ordering-grid.test.mjs` | 實際元件事件：廠商欄位儲存、Enter、等待中補填、失敗重試不重複新增、確認前不宣稱已儲存 |
| `scripts/ordering-page.test.mjs` | 實際頁面 handlers、控制 transport/editor 邊界：載入請求數、flush 等待、取消切換保留、過期回應、儲存回應精確對應列 |
| `scripts/ordering-route.test.mjs` | 真實 in-memory SQLite＋全部 migrations：兩種來源儲存→重開→送出、保留我方欄位空白、pending/search、必填邊界、草稿不查到貨／修訂 |
| `scripts/ordering.test.mjs` | 原 CI 入口納入 page 測試 |
| `VERSION`／`package.json` | 0.9.29；BUILD 維持 0 |

無 migration、權限、其他模組或主題／版型變更。沿用現有資料所有權；沒有建立另一套草稿資料庫或背景同步服務。

### 查詢量與失敗控制

- 既有草稿來源切換：原列表＋詳情＋3 個 refresh，共 5 次業務 API，改為列表＋詳情 2 次；新草稿直接用建立回應；草稿格子儲存不再追加 3 個 refresh。
- 草稿詳情讀取只保留單據／來源／有上限的明細，省去重複單據、到貨／修訂與到貨 SUM；實際延遲仍受網路及身分服務影響，未以正式實測毫秒數宣稱改善幅度。
- 等待期間只補寫使用者新輸入；單次新列工作最多 8 輪成功確認，若持續輸入超過上限則保留未儲存內容，等待下一次 Enter／blur／flush。失敗請求不自動重試，不形成背景無限讀寫。
- 本輪驗證使用合成資料與本機記憶體 SQLite，正式業務資料讀寫 **0 列**，無遠端資料批次整理。部署流程既有唯讀健康驗證另見部署紀錄，不視為業務實測。

### 驗證與交付狀態

- [x] `node --test scripts/ordering.test.mjs scripts/ordering-route.test.mjs scripts/form-keyboard.test.mjs`：最終修改後 36 項通過。
- [x] `npm run build`：瀏覽器與 Worker 型別檢查、Vite build 通過；僅既有 bundle 大小／動態 import 提示。
- [x] `npm run validate:source`：來源合約及共用 UI／表單檢查通過。
- [x] [PR #262](https://github.com/simonliu1118-byte/chihyuan-web/pull/262) 已合併；最終修正 `5712cb0068cdf247332b137a609a7f0cb624f9cf`，主線合併 `d77a05ed30fa3137568e9c6c021ce58422920324`。
- [x] 最終修正的 [Runtime Check #39626268627](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626268627)、[Governance #39626268365](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626268365)、[部署契約 #39626268713](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626268713) 必要檢查全部成功。PR 曾顯示過期 head，暫關重開同一 PR 後確認 SHA 正確，未沿用前一提交檢查合併。
- [x] 原 CYWEB 網站 [部署 #39626518329](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626518329) 成功，來源 `main` 的 `d77a05ed30fa3137568e9c6c021ce58422920324`。來源 consumer 宣告／D1 健康、HTTPS／靜態資源、原正式網域、無效 session 與 Identity 權威檢查全部成功。此次未建立 GitHub Release。
- 部署後僅另補本 handoff 與 TODO 的證據，不修改已部署功能／版本；Claude 可從 `TODO.md` 連到本文件，不需重做上述修正。
- 未登入正式網站建立／送出業務測試單；尚無本輪真實瀏覽器端到端截圖。不可把 handler／SQLite 測試描述成實機驗收。

## ListView／表單盤點與設計（桌面已實作，手機仍待定）

| 既有共用能力 | 實際提供／限制 |
|---|---|
| `src/ui/data/DataView.tsx` | 桌面 table、手機 cards、loading/error/empty/selection；尚無明細編輯與逐格儲存 API。兩種呈現同時建立再用 CSS 顯示，若直接塞輸入欄位，須處理重複 editor／焦點與輸入狀態，不宜直接替換 |
| `src/ui/foundation/editable-list.ts` | 列的新增／更新／刪除／移動、錯誤與 dirty reducer；無 UI、Enter、API 排序及樂觀版本寫入能力 |
| `src/ui/forms/Field.tsx` | Field／FormSection：標籤、必填、擇一提示與長短欄排版，可沿用於手機單筆表單 |
| `src/ui/layout/MasterDetail.tsx` | 寬版左右清單／明細、窄版返回清單；叫貨頁已使用，與逐品項編輯為不同層次 |
| `src/ui/OrderingGrid.tsx` | 目前為叫貨專用，非全系統可編輯列表；承載 Enter、自動新增列及儲存協調 |

### 使用者後續澄清：桌面採緊湊表格，不採卡片

使用者原話：「沒有要卡片式，我要的是桌面版表格式，就不會有一堆欄位、空格等等占位子。手機版看怎麼做比較清楚。」之後確認「就是表格，焦點移入可以輸入」，並核准桌面預覽實作。

桌面建議：

- 使用緊湊資料表格，一品項一列；儲存格持續可直接輸入，平時無獨立輸入框、焦點格顯示細框，不切換顯示／編輯控制。
- 空值保留緊湊儲存格，不顯示大空白輸入框；短欄縮窄，品名／備註分配剩餘寬度，長文字可截短並於查看／編輯時展開。不因這個呈現變更刪掉資料欄位。
- 保留連續鍵盤輸入、備註 Enter 建下一列，以及自動儲存／版本佇列／失敗保護；數量 Enter 現在到單位，不使用舊捷徑。新增時保留末尾編輯列，多筆尚未完成的使用者輸入仍須保留，不能為清爽而刪除。
- 刪除／排序收進每列 `⋮` 入口，以共用 Dialog 操作，避免每列常駐一排按鈕。

手機建議（尚待定稿）：

- 同樣使用緊湊表格，主畫面只呈現「品名、數量、單位」；品名以我方品名優先、無則顯示廠商品名，僅為呈現，不互相複製儲存值。備註有內容才附於品名下方。
- 點選品項後，以共用 Dialog 搭配 Field／FormSection 編輯完整欄位；新增也用同一表單，可提供「儲存並新增下一筆」以利連續輸入。編輯視窗關閉／取消要沿用未儲存保護。
- 不把所有桌面欄位壓在手機同一橫列，也不改成每品項一張大卡片。

兩種呈現共用一套 editor／資料／驗證／儲存控制，依 viewport 只掛載一份輸入控制，切換呈現也須保存未儲存輸入。後續實作時評估從 OrderingGrid 抽出共用的 editable-lines controller／presentation；不要把叫貨專屬欄位、廠商規則寫成全域規則。現有 editable-list 可作底層參考，但不可取代本輪已補上的 API 確認、版本佇列與失敗保護。
