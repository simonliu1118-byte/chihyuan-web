# WO-0.9.69 門市「售後維修」頁籤

- 狀態：程式與自動測試完成，待 Claude 複審與人工視覺驗收（尚未合併部署）
- 分支：cyweb/wo-0.9.69-store-repairs　PR：#354
- 含 migration 與 API：**Claude 審查通過後才合併部署**（使用者 2026-10-30 約定）。

## 1. 背景（使用者原話）

- 「門市功能裡面多加一個新頁籤:售後維修」「基本介面使用門市訂購介面，不需要訂購清單/黑名單」
- 「處理狀態會有: 收件/已檢測/送廠維修/維修完成/通知/機器歸還」
- 「收件就是客人送過來維修我們新增維修單」「新增之後會由門市人員初步檢測問題，檢測完之後按已檢測，這邊要用訂購的叫貨視窗的方式，選擇無異常 或是異常(並填寫問題)，無異常就會跳過送廠維修和維修完成，直接到通知->機器歸還」
- 「檢測有異常之後送廠維修要填寫寄送編號，會有個下拉選單選物流: 自送/郵局/新竹/大榮/黑貓，自送不需填寫寄送編號，那個欄位可以任意填註記，其他的編號是必填」
- 「維修完成寄回來收到之後就會按維修完成」「通知完客人就會按通知」「客人來取了就會變機器歸還，並結案」「機器歸還那個可以選自取或寄送，寄送用一樣的元件選物流」「結案一樣有五分鐘猶豫期」「一樣日期選單都要有無日期可以勾」
- 「原本門市訂購有取消訂購，也做一個取消維修，任意階段都可以取消維修」
- 欄位：「送修日期、客戶編號、客戶名稱、連絡電話/LINE、送修產品、產品機號、故障狀況、購買日期、配件備註」「送修產品在新增維修裡面要可以用勾選並填寫 低周波/薰蒸機/紅外線/電熱毯/其他 全部是勾選並填寫」「呈現在清單裡面就是 低周波 HC-0502 這樣的方式」「一張新增機器維修只能有一個品項」
- 逾期：「送廠超過 N 天未修回」「通知後 14 天未取」
- 取消：「取消還是要走通知、機器歸還」（2026-11-02）

## 2. 已定案事項

- 頁籤名稱「售後維修」，排在「門市訂購」之後。新 Module Access 代碼 `STORE_REPAIRS`（標籤「門市售後維修」），沒有權限就不顯示頁籤。
- **處理狀態**：`RECEIVED` 收件 → `INSPECTED` 已檢測 → `SENT` 送廠維修 → `REPAIRED` 維修完成 → `NOTIFIED` 通知 → `RETURNED` 機器歸還（結案）；另有「取消維修」標記（不是結案，見下方取消維修）。
  - 檢測結果「無異常」：由 `INSPECTED` 直接可按「通知」，送廠與完修兩格顯示斜線（不適用），與訂購「缺貨」的不適用格呈現方式相同。
  - 檢測結果「異常」必填問題說明（最多 200 字）。
- **里程碑欄**（同訂購的叫貨／通知／取貨欄）：檢測、送廠、完修、通知、歸還五欄。每欄完成時顯示日期（MM/DD），點日期可修正日期；下一步顯示「登記」。每個日期對話框都有「無日期」勾選（共用 `DateInput` 的做法與訂購相同）。
- **檢測對話框**：沿用訂購「叫貨」對話框的寫法，日期＋兩選一按鈕「無異常／異常」。選「異常」才出現「問題說明」欄（必填）。
- **送廠對話框**：日期＋物流下拉（自送／郵局／新竹／大榮／黑貓）＋「寄送編號」欄。物流非自送時寄送編號必填；自送時欄位標題改為「註記」，可空白。
- **歸還對話框**：日期＋「自取／寄送」兩選一。選寄送時出現同一組物流下拉與寄送編號（規則同上）。
- **物流選擇**做成門市共用元件 `StoreShippingFields`（物流下拉＋編號／註記），送廠與歸還共用，不可寫兩份。物流代碼 `SELF/POST/HCT/KERRY/TCAT`，標籤 自送／郵局／新竹／大榮／黑貓，定義在 `shared/store-repairs.ts`。
- **取消維修**：任何未結案階段都可以取消，必選理由類別（沿用訂購的 `Reason` 元件）：
  - 顧客不修（費用考量）
  - 無法維修
  - 顧客取回
  - 其他（必填補充）

  取消**不結案**，機器仍要還給客人：
  - 資料存 `cancelled=1`、`cancel_reason`、`cancelled_at`，處理狀態膠囊顯示灰色「取消維修」；
  - 尚未開始的檢測、送廠步驟改為不適用（斜線）；
  - 若取消時**已送廠、尚未完修**，「完修」步驟保留，表示機器已從廠商收回，標題仍為完修。收回後才能通知；
  - 之後照常「通知 → 機器歸還」，歸還時結案。
  - 「取消維修」在通知之前可以撤回，回到取消前的狀態；通知後就不能撤回取消。
  - 清單篩選有「取消維修」，看得到還沒歸還的取消單。
- **結案猶豫期 5 分鐘**：機器歸還（結案）後 5 分鐘內可「撤回」，回到結案前的狀態。規則與訂購相同，邏輯要共用、不可複製。
- **退回上一步**、**修改**（檢測後修改要選修改理由，同訂購 `STORE_EDIT_REASONS`）、**操作紀錄**（共用 `StoreOperationHistory`）都與訂購相同。
- **逾期**：
  - 送廠後超過 **30 天**仍未完修（常數 `STORE_REPAIR_FACTORY_OVERDUE_DAYS=30`）；
  - 通知後超過 **14 天**未歸還（沿用訂購的 14 天常數）。
  
  逾期列淡紅底，篩選列多一個「逾期」；處理狀態膠囊顯示「逾期未修回」或「逾期未取」。
- **新增／修改維修單欄位**（一張只有一個品項）：
  - 送修日期：必填，預設今天；
  - 客戶編號：選填，最多 40 字；
  - 客戶名稱：必填，最多 40 字，含稱謂「先生／小姐」，與訂購相同；
  - 連絡電話／LINE：與訂購同一組 `ContactCells`，三者至少填一；
  - 送修產品：低周波／薰蒸機／紅外線／電熱毯／其他，**五選一的單選**，每個選項旁有文字欄。選中的那一項文字欄必填，其他項停用；文字是型號（例如 HC-0502）；選「其他」時文字是產品名稱。清單顯示為「低周波 HC-0502」，選「其他」時只顯示文字。
  - 產品機號：選填，最多 60 字；
  - 故障狀況：必填，最多 300 字；
  - 購買日期：選填，有「無日期」；
  - 配件備註：選填，最多 300 字。
- **清單欄位**：項次、處理狀態、送修日期、客戶姓名、連絡電話／LINE、送修產品、產品機號、故障狀況、檢測、送廠、完修、通知、歸還、操作。故障狀況過長時省略，滑過顯示全文。配件備註與購買日期在修改對話框中看。
- 搜尋：客戶編號、姓名、電話、LINE、產品型號、機號、故障狀況、寄送編號。篩選：處理狀態膠囊（共用 `StatusFilter`）＋「顯示未結案」。

## 3. 範圍

- **Migration `0043_store_repairs.sql`**：
  - 擴充 `app_member_module_access` 的 CHECK，加 `STORE_REPAIRS`（照 0034 的重建方式，保留所有授權）。
  - 新表 `store_repairs`：
    - 識別與欄位：id、list_sequence、received_date、customer_code、customer_name、honorific、mobile、phone、line_name、product_kind、product_text、serial_no、fault、purchase_date、accessories；
    - 狀態：status、inspect_result、inspect_problem、cancelled、cancelled_at；
    - 物流：send_carrier、send_tracking、return_method、return_carrier、return_tracking；
    - 各里程碑日期：inspected_date、sent_date、repaired_date、notified_date、returned_date，可為 NULL 表示無日期；
    - notified_at、closed_at、cancel_reason、version、created/updated 欄位。
  - 新表 `store_repair_events`：格式同 `store_order_events`。
  - 索引：(status, received_date)、(list_sequence DESC)。
- **可攜備份**：
  - 新表登記 `schema-columns.ts`、`validate_schema.py`；
  - **0043 會改變結構指紋**：照 V0.9.66 處理 0042 的方式，在 `worker/backup/store-*-upgrade.ts` 加 0043 的 LF／CRLF 指紋；舊備份（0042）還原時新表補空，並補「0042 備份可還原到 0043」的測試。**這一步漏了正式備份會無法還原。**
- **API** `worker/http/store-repair-routes.ts`，掛在 `/api/business/store/repairs`，權限 `STORE_REPAIRS`：
  - 清單（LIMIT 501，同訂購）、新增、修改、狀態推進、日期修正、取消、撤回、退回上一步、操作紀錄（cursor 分頁）；
  - 每個寫入都有 requestKey 防重送與 version 守門，Audit 與事件在同一個 batch。
- **前端** `src/runtime/modules/StoreRepairs.tsx`，`StorePage` 加頁籤。
- 測試：狀態流轉（含無異常略過、取消、撤回、退回）、物流規則、逾期判斷、權限、備份還原。

## 4. 不做

- 不做維修費用、保固判斷、廠商管理、列印維修單、通知簡訊。
- 不連動黑名單與訂購。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。只做本單要求的功能與實際會發生的錯誤處理；不加重複驗證、不會發生的情境測試。

## 5. 實作指引

- **先抽共用、再寫維修頁**。`StoreCustomerOrders.tsx` 裡下列部分要抽到 `src/runtime/modules/store-workflow/`（或 `src/ui/` 中真正通用的），由訂購與維修**共用**，訂購改用抽出的版本：
  - 里程碑日期格與「登記」格；
  - 里程碑日期／推進對話框（日期＋無日期＋選項按鈕組）；
  - 結案猶豫期判斷與撤回；
  - 理由選擇 `Reason`；
  - 聯絡資料欄 `ContactCells`／`HonorificCell`；
  - 操作欄四個圖示的排列。
  
  後端的狀態推進、requestKey、事件、猶豫期也比照抽成共用函式，不要複製一份 `store-routes.ts`。
- **一律使用現有共用元件**：
  - `IconButton variant="table"`＋`Icons`（**不要寫 `<svg>`**）；
  - `SegmentedControl`、`StatusFilter`、`DataViewToolbar`、`Field`／`FormSection`、`EntryTable`、`DateInput`、`PhoneInput`；
  - `Dialog`／`useConfirmation`、`Loading`（首次只顯示 Loading）、`StoreOperationHistory`。
  
  需要新的通用元件時，放到 `src/ui/` 並在完成報告列出，由 Claude 審查。
- 送修產品單選：用原生 radio（`name` 相同），每個選項一列「○ 低周波 [型號]」，桌面一行兩到三項、手機一行一項。
- 新 migration 編號 0043；版本 V0.9.69（若 WO-0.9.68 先合併則接續）。

## 6. 驗收清單

- [ ] 有 `STORE_REPAIRS` 權限才看到「售後維修」頁籤；帳號與權限頁可授權。
- [ ] 新增維修單：欄位與必填規則如 §2；送修產品五選一；清單顯示「低周波 HC-0502」。
- [ ] 狀態流轉：收件→檢測（無異常／異常＋問題）→送廠（物流＋編號規則）→完修→通知→歸還（自取／寄送＋物流），無異常可直接通知。
- [ ] 每個日期對話框都有「無日期」。
- [ ] 任意未結案階段可取消，理由必選；取消後仍要通知、機器歸還才結案（已送廠未完修者先完修收回）；通知前可撤回取消。
- [ ] 機器歸還結案後 5 分鐘內可撤回，超過不可。
- [ ] 退回上一步、修改（檢測後需修改理由）、操作紀錄正常。
- [ ] 逾期：送廠超過 30 天未完修、通知超過 14 天未歸還，淡紅底且可篩選。
- [ ] 訂購頁改用抽出的共用元件後行為不變（既有 store-page 測試全過）。
- [ ] 0042 的備份可還原到 0043（新測試）。
- [ ] 固定項目：新表單按 Enter 跳下一欄、日期欄位四碼年份（`PROJECT_RULES.md` §5，`form-keyboard.test.mjs` 會檢查）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。
- [ ] `node --test scripts/*.test.mjs` 通過。
- [ ] VERSION／package.json 版本、TODO 段落已更新。

## 7. 截圖要求

- 桌面 1440、手機 390：維修清單（各狀態各一筆、含逾期與無異常略過）、新增維修單、檢測／送廠／歸還對話框、取消對話框。

## 8. 完成報告（GPT，2026-11-02）

- 工作分支：`cyweb/wo-0.9.69-store-repairs`；[PR #354](https://github.com/simonliu1118-byte/chihyuan-web/pull/354)；目標 `main`。版本 V0.9.69，BUILD 0。**尚未合併、尚未部署、未發布 Release**。
- 實作：獨立 `STORE_REPAIRS` 權限、售後維修頁籤、單件維修單與聯絡資料、檢測／送廠／完修／通知／歸還、無異常跳步、物流選擇、取消後繼續通知及歸還、5 分鐘結案撤回、逾期標示、歷程與日期修改。
- 共用：`ContactCells`、`HonorificCell`、`Reason` 自既有訂購頁抽出；送廠／寄回物流沿用 `StoreShippingFields`；**日期登記格／日期彈窗**（`StoreMilestoneButton`／`StoreMilestoneDateFields`）和**操作四圖示**（`storeWorkflowActions`）已由訂購與維修改用同一套；後端 requestKey 格式、version guard／event、兩種流程結案五分鐘判斷皆使用單一共用實作。
- D1：新增 forward migration `0043_store_repairs.sql`；原有 module 授權保留。備份 portable table whitelist／schema-column coverage 已擴充，對 0042 舊備份補空維修表，並加入還原測試。0043 指紋 LF `b3f9f2a9e256ca168a2811dafba00c69cdbcd030e91251b32b80a46910086b55`、CRLF `a7fc77a58c97ec29ef992b2c83a69cb1f0173371edf9399c2d417d1cb47494cc` 已登錄。
- [Runtime Check #41420795673](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41420795673)：**567／567 項 Node 測試通過、0 失敗**；browser／Worker typecheck、source contracts、Local D1 acceptance、Vite build 成功。
- [Governance Check #41420795649](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41420795649)：通過；[Deployment Contract #41420795771](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41420795771)：驗證通過，實際 deploy-development **skipped**（未部署）。
- 實作初版 Runtime Check 曾因測試替身、備份指紋及 UI 日期輸出預期值未更新而失敗，已在工作分支修正；抽出四操作圖示及日期欄後進行最後一輪完整回歸，**審核時以 PR 最新提交的 CI 成功紀錄為準**，不得只引用舊版通過的執行紀錄。
- [ ] **尚待人工視覺驗收**：桌面 1440、手機 390、各狀態／逾期清單、新增維修單、檢測／送廠／歸還及取消對話框；尚未取得截圖，不能冒稱完成。
- [ ] Claude 複審正式工單 §6／§7、migration、權限與整套維修流程；審查意見請填下方 §9 及 [Claude Handoff](../../handoff/CYWEB-WO-0.9.69-GPT-20261102.md)。複審不等同部署授權。

## 9. 審查紀錄（審查者填）

- 日期：2026-11-03；審查者：Claude；PR #354。
- 結論：**通過**（含 Claude 直接修正）。
- 確認無誤：
  - **Migration 0043**：重建 module access 時保留所有授權；`store_repairs`／`store_repair_events` 結構與 CHECK 正確。
  - **備份**：0043 的 LF／CRLF 結構指紋，與 Claude 另行計算的結果一致；0042 的備份還原時，新表補為空表。
  - **權限**：路由要求 `STORE_REPAIRS` 權限；requestKey 防重送，version 守門防並發覆蓋。
  - **狀態流轉**：無異常跳過送廠；取消後仍要通知、歸還；已送廠的先完修收回；通知前可撤回取消；歸還後 5 分鐘內可撤回。
  - **共用元件**：訂購頁確實改用抽出的共用元件（`store-workflow/`、`workflow-service.ts`、`store-workflow.ts`），沒有自寫 SVG，首次載入只顯示 `Loading`。
- Claude 直接修正：
  1. **不適用（斜線）規則錯誤**：
     - 尚未檢測的維修單，送廠、完修已先顯示斜線；
     - 收件時就取消的單，「檢測」顯示 ✓。
     
     改為只有確定略過的步驟才畫斜線：無異常、或取消時尚未送廠 → 送廠、完修畫斜線；取消時尚未檢測 → 檢測畫斜線。並補測試。
  2. **項次競態**：原本先讀 `MAX(list_sequence)` 再 INSERT，同時新增兩張會撞 UNIQUE。改在 INSERT 內取號。
  3. **新增維修單的上方兩列沒有欄位標題**：補上表頭「送修日期／客戶編號／客戶姓名／稱謂」「連絡電話1／連絡電話2／LINE 名稱／產品機號」。
  4. **逾期列的紅底蓋掉斜線**：GPT 的規則用 `background` 簡寫，把斜線清掉；訂購頁原有規則也同樣有這個問題。兩處都改為 `background-color`，重複的規則刪除。
  5. **手機版卡片被截斷且沒有欄位名稱**：桌面最小寬度 1250px 也套用到手機，且儲存格沒有 `data-label`。前者改為只在桌面套用，並補上欄位名稱。
  6. **共用搜尋列在手機上空出約 300px**：`DataViewToolbar` 在直排時，`flex-basis:320px` 變成高度。這是既有問題，訂購頁也有，已在共用 CSS 修正。
- 驗證：
  - `npm run typecheck`、`node --test scripts/*.test.mjs`（568 pass）、`validate:source`、`validate_schema.py`（44 支 migration）、`validate:d1:local` 通過；
  - 本機截圖：桌面 1680、手機 390 的維修清單與新增維修單。
