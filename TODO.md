## V0.9.79 進貨輔助抽屜版面（WO-0.9.76，2026-11-02）
- [x] 預設精簡表格、每日明細偏好、單一抽屜捲動及固定表頭／品號；圖示加入、固定底部提示、無建議來源及五行廠商列表；390 手機卡片。
- [x] 程式提交65acc04完整Linux591/591與全部必要CI通過，桌面／手機合成驗收完成。
- [ ] Claude審查與後續合併部署；見 [工單](docs/development/work-orders/WO-0.9.76.md) 與 [交接](docs/handoff/CYWEB-WO-0.9.76-GPT-20261102.md)。

## V0.9.78 草稿重複叫貨紅框、廠商品號消失修正（2026-11-03，Claude）
- [x] 草稿列與未到貨同商品加紅框；先填廠商欄位後改品號不再被清掉。
- [ ] 實機驗收：草稿新增一列先填廠商品號再填品號，確認廠商品號保留。


## V0.9.77 未到貨頁籤與顯示未結案（2026-11-03，Claude）
- [x] 未到貨移到來源頁籤列最左（分隔線）；清單加顯示未結案，三處共用 OpenOnlyToggle。

## V0.9.76 WO-0.9.74 到貨紀錄與共用日期欄位（2026-11-03 Claude 審查通過）
- [x] 到貨紀錄改版、可修改／刪除；全站日期欄位改用共用 DateInput。審查紀錄見工作單 §9。
- [ ] 實機驗收：修改一筆到貨的數量與日期、刪除一筆到貨，確認已到數量與狀態正確。

## V0.9.75 加入叫貨單顯示未到貨（2026-11-03，Claude）
- [x] 「加入叫貨單」對話框列出未到貨的叫貨單與剩餘數量。


## V0.9.73 已到貨不能修改叫貨單（2026-11-03，Claude）
- [x] 部分到貨／已到齊／有結掉品項的叫貨單不能再修改（畫面與 API）。
- [x] V0.9.74：進貨輔助的「已在草稿」改為按「加入叫貨單」時才查該品號。

## V0.9.72 進貨輔助移入叫貨抽屜（WO-0.9.71，2026-11-03 Claude 審查通過）
- [x] 共用 SidePanel、叫貨抽屜、ERP 類別移除、草稿批次查詢（0045 品號索引與備份相容），審查紀錄見工作單 §9。
- [ ] 實機驗收：叫貨頁開進貨輔助、查詢期間切到別的模組再回來，確認完成通知「查看」會重新打開抽屜。

## V0.9.71 月度待辦換行版面與項目週期（WO-0.9.68，2026-11-03 Claude 審查通過）
- [x] 週期歷史（每月／單月／雙月／自訂）、換行版面，審查紀錄見工作單 §9。
- [ ] 實機驗收：設定一個單月或雙月項目，確認只在指定月份出現。

## V0.9.69–V0.9.70 售後維修與維修單照片（2026-11-03 Claude 審查通過、合併部署）
- [x] 售後維修（WO-0.9.69）與維修單照片（WO-0.9.70，每筆最多 3 張），審查紀錄見兩份工作單 §9。
- [ ] 使用者在「帳號與權限」授權「門市售後維修」後，實機驗收（含手機拍照上傳與照片清晰度）。
- [ ] 照片檔本體未納入備份，與人事附件同列「附檔備份另案處理」。

## 已部署、待複審：V0.9.64 黑名單與月度待辦（2026-11-02）

- [x] 四處置排序／欄寬／OTHER純內容、移出理由及跨列線；月度16日預產／設定拖曳與備註／停啟用／單格更新及同訂購日期樣式，0041／舊備份保全、Build與合成瀏覽器通過。[Claude交接](docs/handoff/CYWEB-BLACKLIST-MONTHLY-0964-20261102.md)。
- [x] PR345／Linux559/559、必要CI通過，合併06ea336、部署41393553229成功；0041／原50列聚合／限定FK／月度原資料／雙入口source及D1／HTTPS／排程通過，成本與證據已補交接。
- [ ] Claude最終複審及正式登入／觸控實機驗收。

## 已部署、待複審：V0.9.63 補價輸入與十四天逾期（2026-11-02）

- [x] 補單價去箭頭、通知隔日起算14天，跨台北午夜測試／Build／重點67/67及合成瀏覽器通過。[交接](docs/handoff/CYWEB-OVERDUE-14-DAYS-0963-20261102.md)。
- [x] PR343／Linux553/553，部署41336860713成功、雙入口source／D1／HTTPS／排程通過。
- [ ] Claude事後複審與正式登入驗收。

## 已部署、待事後複審：V0.9.62 視窗與取消猶豫期（2026-11-02）

- [x] 共用段落留白／單層FormSection、取消寬288px、metadata24px／12px、移除清單反藍；取消5分鐘撤回及黑名單同步復原／競爭guard／重複取消；build、76重點與合成瀏覽器通過。[Claude交接](docs/handoff/CYWEB-CANCEL-GRACE-0962-20261102.md)。
- [x] PR341完整Linux552/552及必要檢查通過，合併c835d4e、[部署41334505024](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41334505024)成功，雙入口0.9.62／source／D1／HTTPS／排程通過，無migration。實際證據已補交接。
- [ ] Claude最終複審及正式登入實機驗收。

## 已部署、待事後複審：V0.9.61 門市訂購／黑名單（2026-11-02）

- [x] 通知重試、5分鐘結案修正／退回、可空價格與補價、客戶編號／聯絡／品項metadata、備註15×3、整筆樣式、精簡歷程與單筆儲存更新。
- [x] 黑名單日期／篩選、移出保留／加回同ID、逐筆歷程、0038～0040與精確舊備份；build及重點95/95、合成瀏覽器驗收。見[Claude交接](docs/handoff/CYWEB-STORE-WORKFLOW-0961-20261102.md)。
- [x] PR339完整Linux547/547、必要檢查全通過，合併d18d3db，[部署41331933754](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41331933754)成功；雙入口source／D1／HTTPS／排程通過。0038～0040、原448訂購事件與3黑名單來源保全、新timeline3/3／FK／聯絡換位0核對完成；實際命令與成本限制見交接。
- [ ] Claude最終複審及正式登入／實機剪貼簿／觸控驗收。

## 已部署、待事後複審：V0.9.60 Build2 登記／彈窗／歷程換行（2026-11-01）

- [x] 登記20px不撐列、黃色點與篩選標示、實心未結案切換、結果2×2／無日期右側／操作靠右、紀錄整筆連箭頭換行；build與既有19/19、合成瀏覽器驗收通過。
- [x] Build1 PR336完整Linux516/516；Build2限縮訂購form排版selector並恢復月度待辦既有按鈕margin，避免共用class連帶影響。
- [x] 最終Build2 PR337完整Linux516/516、治理通過；合併04edf14、部署41308987671成功，雙入口source／D1／HTTPS／排程通過、無待套migration。見[交接](docs/handoff/CYWEB-STORE-REGISTER-HEIGHT-0960-BUILD1-20261101.md)。
- [ ] Claude事後複審及使用者正式登入實機驗收。

## 已部署、待事後複審：V0.9.60 日期／通知／訂購紀錄（2026-11-01）

- [x] 數字日期與密度、取消日期保留、四叫貨結果、未結案切換、跨年年份、通知客戶告知附加、LINE6字折行與備註加寬、單行歷程、緊湊視窗。
- [x] Build通過；Windows完整512項504通過、8既有平台限制；0037保全及5000guard／備份測試通過。[Claude交接](docs/handoff/CYWEB-STORE-DATE-NOTICE-0960-20261101.md)。
- [x] Linux完整516/516及全部必要檢查通過；PR #334合併8952397，[部署 #41304711418](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41304711418)成功，雙入口0.9.60／source／D1／HTTPS／排程與0037聚合保全驗證通過。
- [ ] Claude事後複審及正式登入實機驗收；migration逐命令計費rows未由Wrangler輸出，已記錄實際182列範圍、26命令36.87ms及額外驗證讀取成本，未冒稱零成本。

## 納入V0.9.60：V0.9.59 Build 2 登記／叫貨清單與日期選項（2026-11-01）

- [x] 登記無框實心色塊、叫貨紀錄直線分隔與實際送出新到舊；日期112px、叫貨結果三選一預設已叫貨。
- [x] Build／重點75/75與合成瀏覽器驗收；[Claude交接](docs/handoff/CYWEB-STORE-REGISTER-FILL-0959-BUILD2-20261101.md)。
- [x] 未獨立發布，整併至上方V0.9.60處理CI／部署；Claude事後複審及實機驗收仍待完成。

## 已部署、待事後複審：V0.9.59 Build 1 表格／結案與紀錄（2026-11-01）

- [x] Pill／欄寬／緊湊按鈕，結案後唯讀；精簡紀錄、移除舊到貨投影、索引游標及60秒有界暫存；項次持久化、新增／改日期只調整區間。
- [x] Build與重點66/66；一萬筆合成事件索引及同日／插入／移位測試，local0036／備份相容通過。
- [x] PR #332合併，Linux完整501/501；[部署 #41283473165](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41283473165)成功，0036／雙入口source與D1／HTTPS／排程通過，正式項次1～11連續。
- [ ] Claude事後複審與實機驗收。見[交接](docs/handoff/CYWEB-STORE-HISTORY-DENSITY-0959-BUILD1-20261101.md)。
- [ ] 未來資料變大時評估模糊搜尋與active黑名單snapshot成本；本輪已移除讀清單的全體排名與歷程重複載入，沒有宣稱所有查詢皆常數成本。

## 已部署、待事後複審：V0.9.59 訂購流程／共用輸入與V0.9.58月度待辦（2026-11-01）

- [x] 訂購三進度、三叫貨結果／供貨失敗通知結案、多品項合併、稱謂、固定四操作與單行紀錄；共用電話／日期、0035及舊備份相容完成。
- [x] 本機build、重點48/48；完整Windows490項482通過，8項既有環境限制待Linux完整CI確認。
- [x] PR #330 完整Linux **494/494**及全部必要檢查通過，合併 `b49976f`；[部署 #41281370342](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41281370342) 成功，0034／0035、雙入口0.9.59／database ok／正確source、HTTPS及月度排程通過。使用者已授權「做完就合併部署」。
- [ ] Claude事後複審、正式登入及實機剪貼簿／月初排程驗收；見[V0.9.59交接](docs/handoff/CYWEB-STORE-CONTACT-PROGRESS-0959-20261101.md)。未來叫貨連動才重新新增到貨欄，部分供貨尚未實作。

## 月度待辦實作（2026-11-01）

- [x] 第三頁籤、獨立模組存取、管理員以上設定門市／項目、年月適用區間、獨立日期／無日期辦理及逐列紀錄已實作；forward migration 0034、台灣午夜補漏排程、可攜備份與舊版空白還原相容已完成。
- [x] 顧客訂購／黑名單桌面清單補回逐列底線；結案剩餘操作按鈕在欄內置中。
- [x] [Draft PR #330](https://github.com/simonliu1118-byte/chihyuan-web/pull/330)：遠端完整Node **484/484**、四個Runtime jobs、Local D1、來源契約、部署契約與Governance全部通過。
- [ ] Claude 最終審查與正式登入／實機驗收；最新發布狀態由上方V0.9.59追蹤。詳見 [交接](docs/handoff/CYWEB-MONTHLY-TODOS-0958-20261101.md)。

## 已部署、待事後審查：V0.9.57 顧客訂購流程（2026-10-31）

- [x] V0.9.57 與 UI Build 1–4 已合併發布，最新 PR #329／main `7ad8da4e0168e0496769b29a7a4096ffce392885`。Claude 事後審查與真實裝置驗收仍依各 handoff 追蹤；先前「未部署」文字為首次交付狀態。見 [交接](docs/handoff/CYWEB-STORE-ORDERS-IMPLEMENTATION-0957-20261031.md)。

## 目前狀態（2026-10-29）

- **V0.9.54 Build 0**（2026-10-29）：一次部署 V0.9.52 門市盤點（migration 0030）、V0.9.53 ERP 清理排程與佇列預估（migration 0031）、V0.9.54 備份頁面精簡與每日季度提醒。CYID consumer 1.0.5。
- 架構：單一 React → protected Worker API → D1；帳號、Session、系統使用權由 CYID 管理，CY Web 只管模組權限（Module Access）與業務授權。
- 模組：客戶、商品、瑕疵、銷售工單、叫貨、門市（顧客訂購與黑名單）、委外/代工、工作日誌、人事（目前僅超級管理員）、ERP 查詢（商品／客戶／供應商／進貨輔助／未收款，排程佇列為右側欄）、帳號與權限、異動紀錄、備份管理、CY 程式、我的帳號。
- ERP 查詢需公司電腦上的 CYERPAutoQuery：正式版 **V1.2.0**（2026-10-28 發布，tag `cyerp-auto-query-v1.2.0`）；自動開啟 ERP、報表匯出、進貨輔助、立即關閉與關閉 15 分鐘已實機確認。
- 備份：手動 R2＋GCS 雙副本與 GCS 隔離還原已通過；可攜備份上限 100,000 列／24 MB，叫貨資料已納入。**自動備份排程未啟用**（使用者決定上線前再開，見下方）。

## 待 Claude 審查：V0.9.52 — 門市庫存盤點（第一階段，交 GPT：[WO-0.9.52](docs/development/work-orders/WO-0.9.52.md)）

- [x] **GPT PR #307 程式與離線驗收完成，待 Claude 最終審查（未合併／未部署）**：Migration 0030、盲盤／複盤／ERP bridge／手機版、17 synthetic regressions；[Runtime #40750528573](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40750528573) 五 jobs 全綠、完整 Node **399/399**，1440／390 真 Chromium 七張 screenshot artifact；CYapps WO-1.3.0 協定已比對。真 ERP、正式 D1 大負載及正式登入 E2E 仍需另行授權與驗證。
- [ ] Claude 審查、合併部署（需 CYERPAutoQuery 1.3.0）。
- [ ] 部署後由使用者把三張舊底稿設為忽略，再按「更新盤點單」。
- [ ] 第二階段（另開工單）：盤點盈虧明細表、盤點資料更新作業、核對庫存異動盤點單、（視需要）核對品號庫存、盤點資料清除作業，完成才算一次完整盤點。

## 待使用者實機確認

2026-10-28 使用者已回報 ERP 查詢、暫停與關閉、進貨輔助耗時與合法資料查詢、登入／分頁、叫貨、V0.9.0–0.9.18 介面、中央系統登記、CY 程式、共用 UI、Email 與一般 Backup 操作 OK；逐項驗收歷史見 `CHANGELOG.md`。以下僅保留尚未確認或已發現異常的項目。

- [ ] **門市顧客訂購**（V0.9.45）：新增訂購、狀態流轉、通知逾 7 天標示、取消轉黑名單、黑名單兩種處置；再決定要不要列印取貨單或通知範本。
- [ ] **表單**（V0.9.35）：客戶拜訪紀錄／常用商品、HR 津貼、身分頁對話框、叫貨來源選單、進貨輔助加入叫貨單。

### 統一人工驗收清單

使用者安排在自動驗收後集中操作及調整；以下須實際觀察，不以自動檢查代替。

| 範圍 | 人工確認 | 前提與保留界線 |
| --- | --- | --- |
| 核心帳號 / CYID | 登入/登出、Session 逾期/撤銷、self-service、返回登入 | 既有受控帳號；不自行新增帳號或授權 |
| Role / Module Access | USER/ADMIN/Identity Admin/SUPER_ADMIN 畫面、撤權/恢復/角色變更 | 受控帳號，不執行未指定的 live 權限變更 |
| CY 程式 | 無 Module Access 仍可看清單；版本／日期／ICON、網頁入口及 ZIP 下載；三個尚未發版項目無下載 | 既有登入帳號；外部 App 自行處理登入權限，未發版項目待正式公開 Release 才補入口 |
| Customer | 建立/編輯/搜尋、Contact/Visit snapshot/日期、Frequent Item、Quote 新歷史/更正/Audit | 保留既有 synthetic fixtures；正式 Item/Quote 需合法 ERP 品項 |
| Item / Defect | 正式欄位、單位/價格精度、Defect 狀態與管理操作 | 合法 ERP 參考，不捏造 live 正式 Item |
| Sales Order | Draft、ERP fill/correction、waiting/picking/shipping/reversal/void、權限提示 | 合法 ERP 參考與受控 synthetic workflow |
| Outsourcing | Contractor/BOM、outbound/receipt/pricing/payment 及反轉、stock/Audit readback | 受控 synthetic workflow，不異動真實庫存/付款 |
| WorkLog | owner CRUD/submit/withdraw、ADMIN review/cancel-review、statistics/readback | 受控 synthetic workflow 與既有帳號 |
| Settings / Audit | 編輯 settings、唯讀 Audit search、actor/reason | 既有權限，不改 production settings |
| 電腦 / 平板 / 手機 | 密度、導覽、表單、捲動、選取、錯誤/載入、觸控/鍵盤 | 真實裝置，調整需求回寫同一 TODO |
| Email | 驗證、重寄／逾期、密碼 recovery 與實際收信 | 使用者 2026-10-28 回報 OK；不再列為本輪待驗收 |
| Backup / recovery | R2／GCS 手動備份與紀錄、隔離還原、排程 | 使用者 2026-10-28 回報一般 Backup OK；隔離還原同日演練成功（V0.9.48）；排程仍未啟用，不得據此操作正式還原 |
| 清理 / 上線 | 核對 fixture/account 清單、受控清理與 first-release gates | 驗收後確認，不自動刪除或 production cutover |

## 隔離還原（2026-10-28 完成驗收）

- [x] V0.9.48（PR #300／#301）合併部署；同日執行受控輪替，`RECOVERY_DB` 改接新版隔離 D1（generation `20261028a`），舊的 0014 隔離庫保留未動。
- [x] 使用者 2026/10/28 21:11 實機演練「驗證成功」（R2 來源，還原前安全備份 R2／GCS 皆已驗證）：**隔離還原驗收通過**。
- [x] 使用者回報：舊 0014 隔離庫已自行刪除。本次僅依使用者回報記錄，未由本對話重新查核 Cloudflare；新庫與正式 D1 不動。
- [x] **本季（台灣時間 Q1–Q4）超管主動站內提醒程式已提交**：本季沒有成功演練 Audit 時，於任何模組的頁首通知 `SUPER_ADMIN`、可直達備份管理，成功後提醒消失。未實作離線 Email／Push；若要用戶未登入也收到提醒，須另決定授權通知管道。
- [ ] 往後**每季人工演練一次**：提醒後由超管另行核准新空白目標輪替、實機驗證與歷史副本清理；不要自動建庫、還原或刪庫。
- [ ] 自動備份排程繼續停用，上線前另行核准。

### V0.9.49–V0.9.50（已合併、部署）

- [x] V0.9.49（PR #303，Claude 審查與 N1–N3 複審通過）：每季超管站內提醒、成功顯示「完成」與結果區塊、已用目標的 UI／Worker 雙重鎖定、手冊改為只留最近一個用過的隔離庫。
- [x] V0.9.50：**演練後自動斷開隔離庫**。部署時若綁定中的隔離庫已用過，就不再綁定 `RECOVERY_DB`（資料不動、不刪庫），之後可直接在 Cloudflare 刪除；一般部署也不再自動建庫，新隔離庫只由 `rotate-recovery` 建立（無綁定時也可輪替）。Worker 不持有 Cloudflare 管理權限。
- [ ] 使用者在 Cloudflare 刪除已斷開的 `cyweb-dev-recovery-v20261028a`（V0.9.50 部署後確認 Worker 已無 `RECOVERY_DB` 綁定再刪）。
- [ ] 每季演練流程：輪替（建新庫並綁定）→ 備份管理演練 → 下一次部署自動斷開 → 刪除該庫。

### V0.9.54 備份管理 UI 精簡（2026-10-29；PR #305 原為 V0.9.51，合併時改號）

- [x] 季度隔離驗證提醒改為每 **24 小時**才重新讀取（使用者進站首次讀取、跨台灣曆季或演練完成時仍可立即同步），不再每小時；不修改自動備份排程。
- [x] 隔離還原成功「✓ 完成」改放進同一個「隔離還原驗證紀錄」區塊，保留原成功時間、結果及歷史表，不再在備份列表上方另外占一個區塊。新空白目標時仍依既有防混淆條件不顯示舊成功大框。
- [x] 備份識別資訊不再展開／收合；桌面表格於「備份時間」與「儲存副本」之間增加「備份資訊」欄，常駐顯示備份編號、版本、完整資料摘要；手機卡片也直接顯示並安全換行。
- [x] 「CYInvoice 災難復原」移至「更新紀錄」右方，加入分隔線；原下方整個說明區塊刪除，固定說明改為按鈕 tooltip。原復原操作 ID、防重送、密碼、確認與 Dialog 邏輯不修改。
- [x] 在原 Runtime Check 的 backup-ui／backup-schedule 測試加入欄位位置、同區結果、toolbar tooltip 與每日節流規則之回歸。
- [x] Claude 審查通過，與 V0.9.52／V0.9.53 一起合併部署。
- [ ] 實機 Desktop／Mobile 驗收。

## 開發待辦

- [x] **WO-0.9.68 月度待辦換行版面與項目週期**（[工作單](docs/development/work-orders/WO-0.9.68.md)，交 GPT，Claude 審查）。
- [x] **WO-0.9.69 門市售後維修頁籤**（[工作單](docs/development/work-orders/WO-0.9.69.md)，交 GPT；含 migration，Claude 審查通過才合併部署）。
- [x] **WO-0.9.70 售後維修拍照上傳維修單**（[工作單](docs/development/work-orders/WO-0.9.70.md)，WO-0.9.69 合併後交 GPT；含 migration，Claude 審查通過才合併部署）。
- [ ] **WO-0.9.71 進貨輔助移到叫貨模組（右側抽屜、已在草稿提示）**（[工作單](docs/development/work-orders/WO-0.9.71.md)，交 GPT，Claude 審查）。

- [ ] **ERP 查詢完成通知位置**：目前共用 Toast 在桌面顯示於右上角；依使用者 2026-10-28 指示，**ERP 查詢完成通知**要改為畫面右下角。實作時先確認是否影響其他共用通知，避免未授權地把全部 Toast 位置一起改掉。
- [ ] **顧客訂購與叫貨連動**（使用者 2026-10-28 列待辦）：訂購品項一鍵加入指定叫貨來源的草稿，該叫貨單到貨時對應的顧客訂購自動改為「到貨」；先確認來源怎麼選（依品號上次來源或手動）、部分到貨怎麼算、一張叫貨單對多筆顧客訂購的對應方式。
- [ ] **銷貨分析頁**（用 `erp_sales_daily`），規格待使用者確認。
- [ ] **使用說明**：所有模組完成後，右上角加「使用說明」按鈕（排在外觀切換左邊），顯示目前頁面的教學並可切換其他模組；頁標題旁的 ⓘ 說明併入。教學內容等模組全部完成後一次撰寫。
- [ ] 手機三欄表格＋點列開完整表單：待定稿，目前維持窄版表格捲動。
- [ ] 各表單分區細節由使用者逐一調整（使用者 2026-10-21）。
- [ ] 網頁標準視覺規範（`docs/architecture/CY_WEB_VISUAL_GUIDE.md`）經使用者確認後升格到 AITeam（使用者 2026-10-18：另開對話處理）。
- [ ] 人事：
  - 部分工時特休比例公式、請假一天的時數換算，待每月法規檢查確認條文（目前：全時每週 40 小時為分母、1 天＝8 小時）；
  - 國定假日補休目前由超管手動給予，若要依排班自動產生另行確認規則；
  - 人事附檔的備份另案處理；
  - 使用者測試發現的問題記在這裡，下一輪一起修。
- [ ] 共用 UI 整理方向：navigation、清單密度、表單／明細、dialog／drawer、loading／error／empty、鍵盤與觸控；刪除、權限、金額與庫存等高風險操作不先顯示成功。使用者提出的小功能先記需求與驗收條件再開工作項目。

## CYInvoice 復原接線（2026-10-18 起）

- [ ] 新 CYWEB PR 的最新 head Governance／Runtime Check／Build 與自動測試、Desktop／Mobile 真實 UI 操作驗收。
- [ ] CYInvoice PR #476 在原 D1 完成備份＋回復演練與 schema 0014／0015、Issuer gate 維護配置、Worker feature flag 後，再唯讀核對真 Session／Email／Binding／原 D1 配置，將 CYWEB `CF_CYINVOICE_RECOVERY_SERVICE` 接到正確命名入口並依具體授權受控部署、真 Email／雙 Windows／DR-01～13；另確認撤銷裝置在途 Work Item fencing、跨 repo 同版位契約及變更密碼／移交後的查回。

## 上線前

- [ ] **啟用自動備份排程**（使用者 2026-10-18 要求其他測試完成前先維持 `CF_BACKUP_SCHEDULE_ENABLED=false`；整體功能測試完成、準備上線前提醒使用者）：
  - 將 GitHub `development` Environment 的 `CF_BACKUP_SCHEDULE_ENABLED` 改為 `true`，保留既有 Worker／主 D1／Identity／R2／GCS 與已使用的隔離驗證副本，從當前 main 受控部署（GitHub 變數寫入 API 目前 403，須由有權限的設定介面操作）；
  - 部署後核對 UTC `30 19 * * *`（台灣每日 03:30）與獨立 catalog `0 19 * * *`；R2 每日保留 30 天、GCS 台灣週三／週日保留 182 天，manual／pre_restore 雙副本；
  - 觀察第一筆真實排程事件與 provider verification／Audit；設定存在或手動成功不等於排程已執行。已使用的隔離副本不得清空重做。
- [ ] **整理測試資料**（測試客戶、工單、人事等）：先備份，列出候選清單給使用者確認，真實資料不可刪，再分批刪除。已知合成資料：客戶「CYWEB 驗收 20261001」與其拜訪紀錄、常用商品「Development 常用商品驗收（未建檔合成品項）」、工作日誌類型 `DEVELOPMENT_ACCEPTANCE` 草稿。依相依順序用正常產品行為清理，保留必要 Audit／history；不清空資料庫。
- [ ] **移除人事「刪除」功能**（測試用，BD-059 第 7 項；`HrService.remove`、DELETE 路由、人員頁刪除按鈕與驗收 `ACCEPT_HR_DELETE*`）。
- [ ] 核對第一版 readiness 與乾淨 production schema；使用者確認後才上線。
- [ ] 舊 GAS／Google Sheets 只作參考，新系統穩定後由使用者決定停用時間；舊測試資料不搬入正式環境。
- [ ] GitHub 設定名稱／scope 的 read-back（API 目前 403，不等於設定不存在），補齊後才搬移 metadata。

## 部署觀察

- [ ] 部署後第一次 health 偶爾仍回舊版本，數秒內轉為新版本（0.7.10–0.7.15 曾觀察 13–33 秒；V0.9.41 部署時正式入口第一次回 0.9.40、約 1.3 秒後轉為 0.9.41），不需重新部署。部署流程在 90 秒內只讀觀察兩個入口；Cloudflare 內部原因未確認。

## 文件地圖

- 永久規則：`REPOSITORY_RULES.md`（共通）、`REPO_POLICY.md`（本 repo）、`PROJECT_RULES.md`（CY Web）
- 架構文件索引：`docs/architecture/README.md`；Business Decisions：`docs/architecture/decisions/README.md`
- 版本紀錄：`CHANGELOG.md`；工作單：`docs/development/work-orders/`
- ERP 查詢：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`；叫貨：`docs/architecture/ORDERING_MODULE.md`；人事：`docs/architecture/HR_MODULE_DESIGN.md`、`HR_MODULE_CONTRACT.md`
- 資料模型：`docs/architecture/CANONICAL_DATA_MODEL.md`、`FINAL_DATA_DICTIONARY.md`、`migrations/`；Worker API：`docs/architecture/API_CONTRACT.md`
- CYID consumer contract 鏡像：`docs/contracts/cyid/`；Identity adapter：`docs/architecture/IDENTITY_ADAPTER.md`
- 部署：`docs/development/IDENTITY_DEPLOYMENT.md`；本機開發：`docs/development/LOCAL_DEVELOPMENT.md`；備份：`docs/architecture/BACKUP_ARCHITECTURE.md`
- 歷史資料：`docs/architecture/archive/` 與 Git history（已結案的舊 handoff 原文和舊版截圖保留於固定快照；`docs/handoff/` 供後續新工作使用，不是目前契約）。
