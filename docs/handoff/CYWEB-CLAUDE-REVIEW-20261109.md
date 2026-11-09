# Claude 審查紀錄：V0.9.87–V0.12.9 事後複審與 #457 首頁審查（2026-11-09）

- 審查者：Claude
- 範圍：
  - 已合併部署的 #377、#379、#427–#462（含文件 PR）。
  - 仍未合併的 #457（首頁、公告與通知、個人待辦、鈴鐺）與 #458（疊在 #457 上的手機改版）。
- 基準：
  - main `ff3562c`（#452 合併後；產品程式同 `67ed079`）。
  - 正式站 `/api/health`：version 0.12.9，sourceCommit `67ed079`，database ok。
  - 正式 D1 最新 migration：`0058_bot_review_push`，沒有 0059。

## 1. 已合併部署：結論＝通過，沒有必須退回的問題

### 自動檢查

在 main 重跑，全部通過：
- `npx tsc --noEmit -p .`
- `npm run validate:source`
- `node --test scripts/*.test.mjs`

各 PR 的 CI 也都是綠的。

### 逐項重點

| 範圍 | PR | 結論 |
| --- | --- | --- |
| 治理 1.1.29：恢復發布分支 | #455 | 通過。`verify-deployment-source.mjs` 只接受兩種來源：<br>• main 手動執行（dispatch）<br>• `deploy/cyweb-development` 的 push<br>兩種都要求事件、checkout、main 三者的 SHA 與 tree 完全一致。<br>輪替、稽核等特殊操作仍只能從 main 執行。`PROJECT_RULES.md` 與部署文件已同步。 |
| BOT 管理中心 | #438、#445、#447、#449、#453、#456 | 通過。<br>• **連線憑證**：只存 SHA-256 雜湊；明文只顯示一次；只有 SUPER_ADMIN 能產生、輪換、撤銷。<br>• **權限範圍**：ingest 每個 BOT 各自獨立（`requireBotScope`）。<br>• **推播 Webhook**：目標限 `https` 加固定主機；以 AES-GCM 加密，並綁 BOT id。<br>• **推播投遞**：outbox 有租約、退避重試、最多 6 次。<br>• **備份**：憑證與推播表刻意不放進可攜備份，還原後重設（`BOT_CENTER.md` 已寫明）。<br>• **建議（非阻擋）**：ingest 沒有頻率上限，reports／completions 也沒有保留期，資料量變大時再評估。 |
| 出機與定期維護、三年矩陣、類別與財產編號 | #429、#431、#433、#437 | 通過。<br>• 權限沿用 `STORE_REPAIRS`。<br>• 0051／0053 的表已納入備份欄位。<br>• 年月選擇是擴充共用 `DateInput`（`precision="month"`），沒有另做元件。 |
| 盤點批號圖示、ERP 清除歸檔 | #440、#443 | 通過。<br>• 只有「ERP 完整清單同步成功、單號已不在 ERP、沒有進行中寫入」時，才在同一個 batch 內先寫入紀錄快照，再刪除盤點單。<br>• 數量用整數單位計算，不會有浮點誤差。<br>• Agent 端自動歸檔尚未啟用（依 CYERPAutoQuery handoff）。 |
| ERP 未收款表格、Session 空白卡 | #435、#439 | 通過，都使用共用表格與既有查詢快取。 |
| 售後維修清單、步驟鎖定 | #426、#427 | 通過。#426 已在 2026-11-04 審過；#427 只調欄位與操作順序。 |
| 手機版（ERP、叫貨、分享 Excel、側欄、密度、BOT 圖示） | #459、#460、#461 | 通過。<br>• 沒有新的 migration、Worker 或權限。<br>• 桌機流程與 API 不變；手機沿用同一個 table 與共用元件。<br>• 分享 Excel 不支援時退回下載。 |
| 進貨輔助：重複品項可取消 | #462 | 通過，有測試確認取消時不會寫入品項。 |
| 舊待審：客戶密度、視窗明確關閉 | #377、#379 | 通過。之後 V0.9.95 起的客戶表格式單據與 Dialog `dismissible` 已取代或延續這兩項，不需另外處理。 |
| 文件與部署證據 | #428、#430、#432、#434、#436、#441、#442、#444、#446、#448、#450、#451、#454、#452 | 通過。#452 是使用者轉述的 Grok 驗收，已合併。 |

### 尚待使用者處理

- **推播 outbox 獨立核對**：draft 2、3 的 `bot_review_push_outbox`（投遞狀態、次數、時間）尚未獨立核對。Claude 嘗試以正式 D1 唯讀查詢，被環境權限擋下；需要使用者以管理介面或授權查詢確認。
- **實機驗收**：仍依 `TODO.md` 的「待使用者實機驗收」清單進行；部署成功不等於實機驗收完成。

## 2. #457 首頁／公告與通知／個人待辦／鈴鐺：設計通過，需修正後才能合併

### 通過的部分

- **API 與權限**：所有 `/api/hub/` 都先經過 CYID 身分驗證，並要求是有效的 app member。
- **個人待辦**：每次 CRUD 都以自己的 `member_id` 查詢，不能讀寫別人的待辦。
- **個人通知可見範圍**：只有收件人看得到；撤回後收件人就看不到。
- **發送權限**：公司公告與個人通知分開授權（`ANNOUNCEMENT_PUBLISH`、`PERSONAL_NOTICE_SEND`），由 Worker 每次重新檢查。
- **資料與備份**：0059 的 module code CHECK 擴充保留原有授權；四張新表已納入備份。
- **讀取量**：鈴鐺用一次有上限的 UNION 查詢加游標分頁，不會把歷史全部下載到前端。

### 合併前必須修正

1. **與 main 衝突，需要重新整理**：
   - 衝突檔案：`CHANGELOG.md`、`VERSION`、`package.json`、`src/App.tsx`、`src/ui/shell/AppShell.tsx`、`docs/handoff/README.md`、`docs/architecture/UI_COMPONENT_CATALOG.md`。
   - 原因：#458 的手機內容已經從 #459–#461 上線。
   - 做法：#457 以最新 main 為基礎，只保留首頁、公告、待辦、鈴鐺，不要帶入 #458 的舊手機改動。
2. **版號**：0.12.7 已被手機版用掉，改用下一個空號；這是新功能，建議 **V0.13.0**。CHANGELOG、handoff、`HOME_HUB.md` 要一起改。
3. **SUPER_ADMIN 撤回別人的通知**：
   - 文件寫 SUPER_ADMIN 可以，但 `noticeDetail` 只讓發送者或收件人讀到通知。
   - 結果：SUPER_ADMIN 撤回別人發的個人通知時，會得到 404。
   - 需要擇一：程式改成允許 SUPER_ADMIN，或文件改成「只有發送者可以撤回」。
4. **待辦與公告編輯頁要照 UI 規範**：
   - 目前是一般直排 `Field`。依 `UI_COMPONENT_CATALOG.md`，資料輸入應用表格式 `EntryTable`。
   - 到期時間用的是原生 `type="time"`；共用元件沒有時間輸入，請先在 `src/ui/forms/` 加共用元件，或決定只用日期。
5. **新進員工的公司公告未讀數**：新員工會把所有歷史公告都算成未讀。請使用者決定是否只計算加入日之後的公告。

### 其他

- #458 已被 #459–#461 取代，**建議關閉**，不要合併。
- 合併 #457 前，要另外取得使用者的部署授權。正式 D1 套用 0059 之前，要先確認備份。

## 3. 本次文件整理

- **交接移出主線**：已審查通過、狀態已同步到 TODO／CHANGELOG 的交接，從 `docs/handoff/` 移出。原文保留在[固定快照 ff3562c](https://github.com/simonliu1118-byte/chihyuan-web/tree/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/handoff)。
- **仍保留在主線**：
  - 本審查紀錄（因為 #457 尚未結案）。
  - `CYWEB-BOT-REVIEW-PUSH-0124-20261108.md`（outbox 待核對）。
- **其他同步**：`TODO.md` 的狀態、待審清單、待驗收清單，以及工單 README，都已同步。
