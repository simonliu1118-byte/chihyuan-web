# WO-0.9.13 異動紀錄改寫、人名顯示、客戶修改紀錄、網頁程式放到工具

- 狀態：待執行（**WO-0.9.12 合併後**才從最新 `main` 開分支；兩張單都會改 `App.tsx` 與客戶頁）
- 分支：`cyweb/change-log`（建議）　PR：（執行者填）
- 依據：`PROJECT_RULES.md` §9；BD-053（一般修改只保留最後修改資訊，詳細稽核僅管理員）、BD-054（共用 Audit Core）
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 1. 背景（使用者原話）

- 「現在的稽核紀錄根本沒有要寫給人看的意思，可能要調整，而且現在這個也不太像是稽核，改個名字?」
- （客戶頁）「如果是修改紀錄的話可能做個小按鈕藏起來就好?」→ 定案：「修改紀錄」按鈕只給管理員。
- 「把工具CY程式裡面的兩個網頁拉出來也放在工具，不要放在CY程式裡面，這樣直接點左邊就可以打開網頁，少一個步驟」

## 2. 已定案事項（不得更改）

1. 「稽核紀錄」改名「**異動紀錄**」（側欄、頁標題、route 顯示名稱）；頁面說明「誰在什麼時候改了什麼」。權限不變：只有 ADMIN／SUPER_ADMIN 能看（BD-053）。
2. 異動紀錄的列表**每列是一句人看得懂的話**：`YYYY/MM/DD HH:mm　姓名　動作「資料名稱」：改了哪些欄位`。不得在列表顯示動作代碼（如 `customer.updated`）、資料類型代碼、操作者 ID、原始 JSON。
3. 篩選只有：**模組**（下拉）、**期間**（今天／近 7 天／近 30 天／自訂起訖）、**操作者**（下拉，顯示姓名）、**關鍵字**（比對資料名稱與編號）。移除「資料類型」「資料編號」「動作」「操作者編號」輸入框。
4. 點一列開右側抽屜看明細：上方一句話摘要；下方表格「欄位｜改前｜改後」（欄位用中文名稱，值也轉成人看的文字，例如分類 ID → 分類名稱、`true` → 是）。原始 JSON 收在最下方可展開的「技術細節」，**只有 SUPER_ADMIN 看得到**。
5. 客戶明細標題列「修改」旁加小按鈕「**修改紀錄**」，**只有 ADMIN／SUPER_ADMIN 看得到**；按下開視窗，用與異動紀錄**相同的元件與文字**顯示這個客戶的紀錄。
6. **人名顯示**：CY Web 畫面上凡是「人」都顯示姓名（無姓名時才退回員工編號）。目前各 API 回傳的 `displayName` 都是 `null`（`app_members` 沒有姓名欄位），需在 CY Web 的 member projection 快取姓名；身分權威仍是 CYID（`CANONICAL_DATA_MODEL.md` 已允許 app_members 快取 display metadata）。
7. 「工具」群組：CY 程式目錄中 **platform 為 web 且有網址** 的程式（目前為「志遠記帳系統 Web 版」「價格觀測室（原型）」）直接列在側欄「工具」下，點擊**以新分頁**開啟該網址；這些程式**不再出現在 CY 程式頁**。清單由 `shared/program-catalog.ts` 推導，不得在側欄另寫死網址。所有人都看得到（各網站自行驗證登入與使用權）。

## 3. 範圍

1. 人名快取與各 API 姓名回填。
2. 異動紀錄頁改寫（名稱、篩選、列表、明細、權限）。
3. 動作與欄位的中文對照（共用，供異動紀錄與客戶修改紀錄使用）。
4. 客戶「修改紀錄」按鈕與視窗。
5. 側欄「工具」放入網頁程式、CY 程式頁移除它們。
6. 文件、版本、TODO。

## 4. 不做

- 改變稽核寫入內容（哪些操作要記、記哪些欄位）、`audit_events` 結構、BD-053／054 的範圍。
- 讓一般使用者看到異動紀錄或修改紀錄。
- 以 CY Web 取代 CYID 成為姓名或身分的權威；不得把姓名寫回 CYID。
- 其他模組加「修改紀錄」按鈕（本單只做客戶）。
- 「使用說明」按鈕。

## 5. 實作指引

### 5.1 人名快取（先做）
- 新 migration `migrations/0016_member_display_name.sql`：`ALTER TABLE app_members ADD COLUMN display_name TEXT CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 120);`。同步更新 `worker/backup/schema-columns.ts`、`scripts/validate_schema.py`（欄位清單）、`docs/architecture/FINAL_DATA_DICTIONARY.md`、`CANONICAL_DATA_MODEL.md`（註明是 CYID 名稱的快取，權威在 CYID）。
- `worker/auth/app-access.ts`：`ensureAppMemberProjection` 增加可選參數 `displayName`；有值且與現值不同時更新。`resolveAppMember` 傳入 `principal.displayName`（每位使用者登入／呼叫 API 時自動更新自己的姓名）。
- 補齊未登入過的人：在 `worker/http/settings-audit-routes.ts` 的異動紀錄 API（管理員呼叫時）以呼叫者 session 讀一次 CYID admin snapshot（重用 `worker/http/module-access-routes.ts` 的 `identitySnapshot()`），把 snapshot 內 `employee_id → name` 更新到 `app_members.display_name`（只更新有變動的列；snapshot 失敗時略過，不可讓 API 失敗）。
- 把目前回傳 `displayName: null` 的地方改為讀 `app_members.display_name`：`customer-repository.ts`、`customer-related-repository.ts`（2 處）、`customer-related-mutation-lookups.ts`、`sales-order-repository.ts`、`defect-repository.ts`，以及 WO-0.9.12 新增的客戶 `updatedBy`。畫面上的人員顯示統一用「姓名，沒有姓名才用員工編號」（建議在 `src/ui/foundation/format.ts` 加 `formatPerson(ref)`）。
- `validate:d1:local` 驗收：新增檢查——登入者呼叫後 `display_name` 被寫入；查詢客戶時 `ownerEmployee.displayName` 有值。

### 5.2 動作與欄位對照
- 新增 `src/runtime/modules/change-log-labels.ts`（或 `shared/` 下同名檔，若後端也需要）：
  - `entityLabel(entityType)`：例如 `customer` → 客戶、`item` → 商品、`defect` → 瑕疵、`sales_work_order` → 銷售工單、`outsourcing` → 代工單、`contractor` → 代工對象、`work_log` → 工作日誌、`setting` → 設定、`module_access`／`module_access_group` → 使用權／權限群組、`backup` → 備份、`erp_item_query` → ERP 查詢。
  - `actionLabel(action)`：把 worker 內所有實際寫入的 action（用 `grep -rhoE "\"[a-z_]+\.[a-z_]+\"" worker --include=*.ts | sort -u` 與 `audit.record(` 的呼叫點列出）全部對到中文動詞片語，例如 `customer.created` → 新增客戶、`defect.invalidated` → 作廢瑕疵、`sales_work_order.shipped` → 出貨、`module_access_group.updated` → 修改權限群組。未知代碼的退路：`entityLabel + （新增／修改／刪除／其他）`，依代碼尾端判斷。
  - `fieldLabel(entityType, key)` 與 `fieldValue(...)`：依各模組 persistence 寫進 `before_json`／`after_json` 的鍵，對到中文欄位名；分類、狀態、地區、部門等 ID 以 lookup 轉名稱（可用前端已有的 lookup API）；布林轉「是／否」；日期用 `formatDate`／`formatDateTime`。找不到對照的鍵顯示原鍵名（不可整筆失敗）。
  - 加一個 node 測試：所有 worker 中出現的 action 代碼都有 `actionLabel`（掃描 worker 原始碼比對，防止日後新增動作忘記翻譯）。
- 「資料名稱」：優先用 `after_json`／`before_json` 內的名稱欄位（客戶簡稱、商品名稱、工單客戶名…），沒有則用 `資料類型 #編號`。

### 5.3 異動紀錄 API
- `GET /api/admin/audit` 保留現有參數，新增：`entityTypes`（逗號分隔，供「模組」篩選）、`q`（關鍵字，比對 `entity_key` 與 JSON 內名稱欄位，可用 `LIKE`）、`cursor`（載入更多）。回傳每筆加上 `actor: { id, employeeNo, displayName } | null`（join `app_members`）。權限與現在相同。
- `docs/architecture/API_CONTRACT.md` 同步更新。

### 5.4 異動紀錄頁
- `src/runtime/modules/AuditOperationalPage.tsx` 改寫（檔名可改為 `ChangeLogPage.tsx`，若改名需同步 `scripts/validate_operational_runtime.py` 檢查的頁面名稱與 `loadAudit` token）。
- 版面：上方篩選列（模組下拉、期間分段按鈕＋自訂起訖、操作者下拉、關鍵字），預設「近 7 天」。
- 列表依日期分組（`2026/10/18（今天）` 標題），每列一句話（§2 第 2 點），底部「載入更多」（共用 `useLoadMore`／`LoadMoreRow`）。
- 明細抽屜（共用 `Drawer`）：摘要句、欄位表格、`狀態：已建檔 → 處理中`（若有 `statusFrom/To`，用各模組既有的狀態中文）、SUPER_ADMIN 才有的「技術細節」（`<details>` 內 JSON）。
- 共用元件抽出：`ChangeLogList`（列表＋抽屜），供 §5.5 客戶修改紀錄視窗重用。
- `src/App.tsx`：側欄與頁標題文字改「異動紀錄」，`PAGE_META.audit.description` 改「誰在什麼時候改了什麼」；route key 可維持 `audit`。

### 5.5 客戶修改紀錄
- `CustomerOperationalPage.tsx` 客戶明細標題列「修改」旁，ADMIN／SUPER_ADMIN 才顯示 `cy-op-button`「修改紀錄」。角色資訊由 `App.tsx` 以 prop 傳入客戶頁（或既有 session context），不得在客戶頁另打身分 API。
- 按下開共用 `Dialog`（`size="large"`，標題「修改紀錄 — {客戶簡稱}」），內容 `ChangeLogList`，固定篩選 `entityTypes=customer&entityKey={id}`；若拜訪／報價／常用商品的事件能由 `entity_key` 或 `metadata` 判斷屬於該客戶，一併列出（在完成報告說明怎麼判斷）。

### 5.6 側欄「工具」
- `src/ui/foundation/navigation.ts` `NavigationItem` 加 `external?: boolean`。`AppShell.tsx` 對 `external` 項目：`target="_blank" rel="noopener noreferrer"`，**不攔截點擊**（不經 `onNavigate`），文字後加小的外部連結圖示（inline stroke SVG，`aria-hidden`），`aria-label` 加「（另開新分頁）」。
- `src/App.tsx` 的 `programsNavigation`：先放「CY 程式」，接著由 `shared/program-catalog.ts` 篩出 `platform === "web" && websiteUrl` 的項目產生 external 項目（label 用程式名稱；可去掉括號內「（原型）」以外的長名稱，**不得**改目錄資料本身的名稱——若要短名稱，在目錄加可選欄位 `navLabel`）。
- `src/runtime/modules/ProgramCatalogPage.tsx`：不再列出上述 web 程式。
- 側欄圖示：沿用 `AppShell` 的 `NavIcon` 機制，外部網站用一個通用圖示（例如方框加右上箭頭）。

### 5.7 文件、版本、TODO
- `VERSION`／`package.json` → `0.9.13`；`BUILD` 維持 `0`。
- `TODO.md` 最上方新增 0.9.13 段落並連結本單。
- `CY_WEB_VISUAL_GUIDE.md`：異動紀錄的列表句型與明細格式、人員顯示規則（姓名優先）、側欄外部網站項目。
- `API_CONTRACT.md`、`FINAL_DATA_DICTIONARY.md`、`CANONICAL_DATA_MODEL.md` 依 §5.1、§5.3 更新。

## 6. 驗收清單

- [ ] 側欄與頁標題為「異動紀錄」，說明為「誰在什麼時候改了什麼」；一般使用者看不到、直接開網址會被導回。
- [ ] 列表每列是一句話（時間、姓名、動作、資料名稱、改了哪些欄位）；畫面上找不到動作代碼、資料類型代碼、操作者 ID、JSON。
- [ ] 篩選只有模組、期間（預設近 7 天）、操作者（姓名）、關鍵字，且都有效；可載入更多。
- [ ] 明細抽屜為「欄位｜改前｜改後」中文表格，ID 轉成名稱；技術細節只有 SUPER_ADMIN 看得到。
- [ ] 所有 worker 中的 action 代碼都有中文對照（測試通過）。
- [ ] 客戶明細有「修改紀錄」按鈕（僅 ADMIN／SUPER_ADMIN），視窗內容與異動紀錄同格式，只列該客戶（及能判斷屬於該客戶的相關紀錄）。
- [ ] 客戶負責業務、最後修改者、拜訪／報價的建立者、瑕疵與工單負責人等處顯示姓名（無姓名才顯示員工編號）。
- [ ] migration 0016 本機套用成功；`validate_schema` 通過；姓名快取驗收通過。
- [ ] 側欄「工具」下有「CY 程式」與兩個網頁程式；點網頁程式在新分頁開啟正確網址；CY 程式頁不再列出它們。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（`audit-account-portal` 需 `.tmp/canonical-cyapps`）。
- [ ] VERSION／package.json 為 0.9.13；TODO、視覺規範、資料字典、API 合約已更新。

## 7. 截圖要求

以 mock 資料（至少 10 筆跨模組異動，含客戶修改、瑕疵作廢、工單出貨、權限群組修改）：
1. 異動紀錄頁（桌面 1440，淺色），預設近 7 天。
2. 同頁深色。
3. 明細抽屜：一般管理員視角（無技術細節）與超級管理員視角（有技術細節）各一張。
4. 客戶「修改紀錄」視窗。
5. 側欄「工具」群組（桌面）與手機選單抽屜。
6. CY 程式頁（確認網頁程式已移出）。

## 8. 完成報告（執行者填）

- 驗收清單逐項結果：
- 與工作單不同之處與原因：
- 驗證指令輸出摘要：
- 截圖位置：

## 9. 審查紀錄（審查者填）

- （待審查）
