# V0.9.59 顧客訂購／共用輸入：交 Claude 複審

2026-11-01 Asia/Taipei。與 V0.9.58 同分支 `cyweb/monthly-todos-0958`、[PR #330](https://github.com/simonliu1118-byte/chihyuan-web/pull/330) 一併交付。使用者最新明確授權「上面這些可以做」「做完就合併部署」，取代本分支初期僅留 Draft 的限制；保留 Claude 事後複審，GPT 沒有代簽通過。尚未執行遠端 migration／部署，結果於完成後更新本檔。

## 修改與原因

- `shared/store.ts`、`worker/http/store-routes.ts`：稱謂獨立儲存、叫貨三結果、正常三進度、供貨失敗通知結案、取消理由精簡、全步驟無日期、通知實際確認時計、查詢前全域項次。保留模組 gate、CAS／request key、原子事件／Audit、黑名單既有處置及人工核對。
- `migrations/0035_store_contact_progress.sql`：刪除實體 arrived_date；ARRIVED 轉 ORDERED，已叫貨補正常結果，新增訂購／黑名單稱謂及訂購結果，舊通知缺實際確認時計以 updated_at 補值。沒有刪訂購、品項或不可變事件；歷史 event JSON 的舊到貨快照保留作稽核。
- `StoreCustomerOrders.tsx`／`store.css`：項次、多品項僅三欄分列及其餘 rowSpan、獨立價格數量、純文字整格進度／登記、固定四操作含 disabled、灰色供貨失敗、黃色待取貨、紅色未取；姓名稱謂、電話顯示、橫線與欄寬。所有狀態篩選含未取均計入總數；結果儲存提示改為「進度已儲存」。盤點手機介面沒有修改。
- `StoreOperationHistory.tsx`：共用歷程每筆單行，時間／人／動作／異動摘要並排，只列有變動欄位，長文 title 全文；移除重複多行 dates 快照。訂購、黑名單及月度同用。
- `shared/phone.ts`、`src/ui/forms/PhoneInput.tsx`：事前確認沒有相同共用元件後新增；已知完整台灣電話格式、全形轉數字、純數字儲存及複製／剪下、按數字位置刪除與還原游標、唯讀 PhoneText。未知／不完整不猜區碼。
- `shared/date-input.ts`、`DateInput.tsx`／`date-input.css`：參照 CYACCWEB 實際來源互動，CYWEB 尺寸／token；四／八碼、月年選擇、今天、Ctrl 上下、外點及 Esc。popover top layer 避免裁切；142px 輸入、230px 日曆、觸控296px。`StoreMonthlyTodos.tsx` 共用同一日期輸入。
- `worker/backup/store-progress-upgrade.ts`、`schema-columns.ts`、`portable-backup.ts`：新版實體欄位與精確 pre-0035 schema 三種行尾 hash；舊 pre-0033／0034 仍依同 migration 規則升級至空 target，沒有放寬未知 schema／scope／integrity／非空目標檢查。
- `scripts/store-route.test.mjs`／`store-page.test.mjs`／`store-monthly-ui.test.mjs` 更新新流程及共用元件；新增 `shared-contact-date.test.mjs` 真實輸入事件測試，backup upgrade 新增 pre-0035 與真 migration 對照。
- VERSION／package 0.9.59，BUILD 0；架構、資料字典、共用輸入文件、TODO／CHANGELOG／交接入口同步。V0.9.58 月度 schema／排程／權限詳見[原交接](CYWEB-MONTHLY-TODOS-0958-20261101.md)。

## 驗證證據

- `npm run build` 通過：browser／Worker typecheck、Vite。僅既有 bundle size 與 fixed-point dynamic import 提示。
- 重點回歸 **48/48**：訂購真 SQLite route、UI、月度 UI、電話日期、備份升級。完整 Node Windows **490 項，482 通過、8 失敗**，均為原有 Windows 路徑／CRLF 相容限制（六項 backup rehearsal mock regex、deployment-source LF split、secure-entry URL pathname），未削弱 guard。Linux CI 尚待本次 source 上傳後完整重驗；不得以 V0.9.58 的484通過充當這版證據。
- Wrangler local D1 完整 forward chain 及0035成功；目前 mixed-line-ending schema `dd6a68b7c31c65be0c1bfc2451ab1a8b4a87eb3db31e31c06df3228af9876f93`，另釘全 LF `44651dd77292aa685c076f9d1e3d13187c1fe9ee4910d09d90ccd05d4ddc2646`、CRLF `11d814ec26979bbde7366e3e07f27cd953bc1363fca58e9bf8c4d4583f861f8e`。FK check 通過。
- 真前端＋真 API handler＋隔離 SQLite／合成身份瀏覽器驗收：七筆不同狀態、兩品項三欄分列、叫貨缺貨 × → 無日期通知結案、四操作停用、每筆紀錄22.6px且 nowrap。1440px 文件1440、表格1374，不增加文件橫捲；1280保留表格內捲動。合成桌面畫面本地 `outputs/store-0959-final.png`。
- 日期實機：1029 Enter → 2026/10/29 並換下一欄；年月切換選2024/02/29，Ctrl 上 → 2024/03/01；八碼20261031正確；Esc只關日曆。390px 月度頁 document390，日期輸入142、日曆左152右382，不超出 viewport。
- 瀏覽器虛擬剪貼簿未收到 Ctrl+C，不能作 OS 剪貼簿驗收；以真 PhoneInput handler 的 copy／cut／Backspace 測試驗證。實際使用者瀏覽器剪貼簿與正式登入仍待人工確認。部分連續 screenshot 回傳局部畫面，不把無效圖當證據；以 DOM尺寸與首次完整畫面佐證。

## 發布前讀寫估算

唯讀盤點既有業務表規模與 migration ledger：合計 **27 read／0 write**，僅11筆訂購、0黑名單、13筆模組授權，最後0033。0034一次重建13筆授權並建四張空表；0035只掃描／轉換這11筆訂購，沒有全庫逐列整理。預估兩 migration 含索引／schema／ledger額外成本各少於1000 read／1000 write，不需拆成大型回填工作；只執行一次，失敗停止，不反覆重跑整庫。

依 [D1官方計價](https://developers.cloudflare.com/d1/platform/pricing/) 保守以 Free每日500萬read／10萬write比較，低於0.02%／1%；不假稱已確認帳號付費方案或當日其他服務餘額。正式 migration 實際統計需由部署輸出追加；沒有新資源、R2匯出或新Identity授權。月度未設定不產生資料；日常補漏使用月份索引／JSON join、三次有限競爭重試；清單十二月份、歷程二十筆分頁。

## Claude 重點與限制

1. 整筆叫貨結果而非逐品項部分供貨；缺貨／絕版鎖叫貨，通知結案／退回及正常日期更正不得繞過終止條件。
2. 通知無日期七天基準、改日期保留確認時計、重新通知時計重設；舊無日期以 updated_at 推估的限制。
3. 0035 實際刪到貨日期，原始 CHECK仍接受歷史 ARRIVED文字但現行 API拒絕；舊事件快照保留，不應誤認未刪實體欄。TODO未來叫貨連動再新增到貨。
4. 新舊備份 hash／精確欄序／migration等價、非空及範圍防護；新稱謂不得改原姓名或推斷既有資料。
5. 共用輸入選取剪貼簿、符號邊界刪除／游標、日曆top-layer／父視窗Esc與Enter；不連帶替換其他模組。
6. 月度管理員設定、一般模組gate、生效月份／歷史斜線／排程並發與備份見 V0.9.58交接；正式月初長期排程及使用者實機仍待驗收。

## Claude 最終審查

待 Claude 記錄通過／需修正與意見；GPT 不代填。

## 合併與部署

待必要CI通過後依使用者授權執行受控發布，完成後補 commit、run、health、migration用量。
