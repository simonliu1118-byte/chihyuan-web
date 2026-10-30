# CYWEB V0.9.57 Build 1 — 顧客訂購清單密度、圖示與叫貨無日期

日期：2026-10-31（Asia/Taipei）。延續 V0.9.57 返修，BUILD 0 → 1，VERSION 不變。
依使用者本輪指示及後續補充實作；沿用本對話單純 UI 返修可合併部署的授權，完成 CI 後發布。本輪無 migration。

## 改動及原因
- `StoreCustomerOrders.tsx`：電話／手機合成一格，兩值都有時分兩行、緊行距；空值不顯示破折號；合併後 14 欄，展開紀錄 colspan 同步。
- 訂購日期顯示 YYYY/MM/DD，四個進度日顯示 MM/DD；編輯欄仍完整日期，title／aria-label 保留年份。已退回下一步優先顯示單一重新登記圖示，避免同格重複塞日期與下一步。
- 姓名欄以 7 個中文字寬度計算，LINE 10 字；此為清單顯示寬度，未縮減原輸入字數上限。
- colgroup 明確分配：狀態74、訂購日期86、姓名7em+14、聯絡108、LINE10em+14、金額／訂金各66、備註128（原160的80%）、四進度各56、操作130px，品項取得其餘空間。一般六位金額含千分位可完整顯示。
- 表頭狀態／叫貨／到貨／通知／取貨／操作置中，金額／訂金表頭與內容靠右。
- 圖示改一致清楚的 24 viewBox、18px SVG、2px stroke；修改鉛筆、取消圈叉、退回折箭、歷程時鐘箭頭、下一步圓箭頭。所有按鈕維持 title／aria-label，紀錄保留 aria-expanded／controls。
- `store.css`：提高 icon 規則 specificity，box-sizing 明確、固定內距及 SVG flex:0 0 18px／min-width，避免共通 compact 內距造成圖示被縮成小點；操作列 nowrap，26px×4＋gap 在130px欄完整呈現。手機保留36px觸控尺寸。
- `erp-item-query.css`：共通 grid divider 2px、同一 border token；訂購與盤點共用。訂購分隔在狀態｜日期、備註｜叫貨、取貨｜操作。去掉分隔線前一格的右細線，避免 1px+2px 疊成3px；盤點品號分組粗線使用同一 token，計算效果維持原2px。

## 叫貨日期例外（使用者新增要求）
- 日期小視窗新增共用 `CheckField`「無日期」，僅叫貨顯示。勾選後日期停用並以空值送出；取消勾選才必須選完整日期。叫貨未填日期以勾選圖示顯示，不顯示未記錄／補登文字。
- `store-routes.ts`：僅 ORDERED 的 advance 允許省略／空／null 作業日期，date correction 允許明確空／null；其他步驟仍必填、不可清空。保留 hasEverOrdered、版本 guard、事件、日期先後檢查。不新增 DB 欄位／migration，不捏造日期。
- 叫貨無日期後仍能前進到貨；叫貨前後修改理由政策不變；null 不代表回到訂購。
- 舊版「所有進度日期不可清空」規格在叫貨一欄由本輪使用者指示例外取代，其他三欄維持原規則。

## 驗證證據
- npm run build：browser／Worker TypeScript 與 Vite 通過（既有 bundle warnings）。
- 門市 API／真實頁面 handler／備份／共用表單／盤點 UI focused 39/39 通過；新增驗收叫貨無日期與其餘必填限制、合併聯絡欄、勾選、日期格式及三個分隔表頭。
- 本輪成功使用 in-app browser 對 localhost 合成資料進行實際 DOM／截圖驗收，未登入或操作正式訂單。
- 1660px viewport 實測：四個操作按鈕 top 均相同、各26px；SVG 各18px；雙號碼行距約15px；六位金額999,999完整顯示。四進度最終56px、姓名105px、LINE144px、品項461px。指定表頭 center、金額 right 已由 DOM computed style 核對。
- 實測「無日期」勾選：日期 disabled；取消勾選：DOM disabled=false／required=true；勾選儲存後顯示日期已儲存並保留叫貨勾選。另修正 popover 受表格 nowrap 影響造成的日期欄溢出，checkbox固定16px，日期欄使用grid換行。
- 本機合成驗收圖片：outputs/store-build1-list.png、outputs/store-build1-no-date.png（非正式訂單資料；不納入 Git，使用者可在本聊天查看）。
- git diff --check 通過；最終遠端 CI／合併與部署結果以本 PR／對應 main dispatch run 為準。

## Claude 複審與範圍
- Claude 尚未審查，不代填通過。請核對 optional ORDERED/null 語意、叫貨退回再前進、跨年份日期提示、圖示 CSS 優先順序、桌面及手機斷點、共用粗線是否影響其他叫貨 grid。
- 未修改 schema、正式資料或黑名單規則。保留前輪已部署證據索引：`CYWEB-STORE-ORDERS-IMPLEMENTATION-0957-20261031.md`，本分支亦帶入文件 PR #325 的兩檔部署 handoff 補正，避免主線缺少實際發布紀錄。
