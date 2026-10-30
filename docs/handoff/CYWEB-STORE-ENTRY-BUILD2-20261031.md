# V0.9.57 Build 2 — 訂購新增／修改共用表格返修

日期：2026-10-31（Asia/Taipei）。使用者確認設計後要求先完成本項，再繼續討論月度待辦。沿用本對話 UI 返修可合併部署授權；Claude 尚未複審，不代填通過。

## 檔案、原因與行為

- `src/ui/forms/EntryTable.tsx`、`entry-table.css`：共用表單草稿表格殼與表頭必填標記，沿用現有 ordering grid。此為表單內編輯，儲存仍由外層表單統一處理；不套用 OrderingGrid 的叫貨專用欄位或逐格自動儲存。
- `src/ui/forms/Field.tsx`：新增 opt-in `presentation="cell"`。保留共用 Field 的 label、required、data-label／缺漏回報，只將表格內重複標題改為視覺隱藏。其他表單的預設 presentation 不變。
- `src/runtime/modules/StoreCustomerOrders.tsx`：新增與修改共用 EntryTable，基本資料是五欄表頭／儲存格；品項直接用共通 cy-ordering-cell 輸入，不再在格內重複顯示「品名 1」等字樣。必填星號僅在可見表頭呈現。
- 每列共用 IconButton：左刪除、右加號，按加號插入該列下方，保留相鄰草稿；至少保留一列。移除下方獨立加列按鈕。
- 下方共用同一組六欄：備註合併品號／品名／數量三欄；金額合計對單價；訂金對金額；尾款對操作。三個金額區的表頭／內容均置中，數值同字級及700字重；備註輸入內容靠左。
- `store.css`：品號100px、數量70px（4位數）、單價／金額／操作各88px（6位數／千分位／雙圖示），其餘空間全給品名。不新增數值上限，原數量小數及伺服器規則保留。
- 電話／手機／LINE 三擇一不再有常駐說明；全空時僅第一聯絡控制項 required，送出時由共用 FeedbackProvider 一次警告並阻擋。填任何一項即可解除必填與過期紅框。黑名單使用的共用聯絡欄同步去除常駐提示，驗證規則不變。
- 已叫貨的修改視窗最上方、表格外：左修改理由210px，右單行補充說明使用剩餘寬度；「其他」補充必填。新增／叫貨前修改不顯示理由。取消訂購的理由表單維持原樣。
- 所有訂購進度日期小視窗：日期控制項本身142px，外層依內容收合（實測160px）；保留四碼年份、叫貨無日期例外與其他步驟日期必填。手機日期視窗仍在原卡片內，操作觸控按鈕36px。
- `scripts/store-page.test.mjs`：驗證共用表格、cell presentation、備註與三個金額欄對位、無常駐提示、聯絡三選一、列插入／刪除／相鄰資料、4/6位數送出、修改理由置頂且條件式必填。
- `BUILD`：1 → 2，VERSION 維持0.9.57，同一訂購 UI 工作返修。

## 驗證

- `npm run build`：browser／Worker TypeScript、Vite 通過；僅既有 dynamic import／bundle size warnings。首輪本機 Wrangler log 寫入受限，但建置成功；第二輪將 log 導向忽略的 `.tmp/` 後成功且無該錯誤。
- `node --test scripts/store-page.test.mjs scripts/store-stocktake-ui.test.mjs scripts/form-fields.test.mjs scripts/form-keyboard.test.mjs`：21/21通過。首次受限模式 esbuild 父目錄讀取被阻擋；以獲准本機執行完成。
- 實際 in-app browser、合成 API transport、明亮主題、1200×800 驗收：隱藏重複 cell labels 共0筆可見；六欄實測100／575.95／70／88／88／88px；三金額區對齊同一欄界，computed text-align center、字重均700。9999數量、六位單價與999,998金額可顯示。
- 實際儲存：聯絡全空時才出現「請填寫：電話／手機／LINE 至少填寫一項。」；補LINE後 phone required=false、aria-invalid=false、常駐提示0筆，儲存成功顯示「訂購已儲存」。未操作正式訂單。
- 日期欄實測142px、小視窗160px；叫貨仍可勾無日期。實際修改畫面確認理由與補充說明在表格上方同一列，「其他」補充說明紅星號正確。
- 390px窄螢幕DOM驗收：視窗375px，表格600px被限制在324px內層捲動區，操作按鈕36px；未將桌面欄寬擠壓到手機頁面外。已重設驗收viewport並關閉自建tab／本機server。
- 圖片在本機聊天輸出 `outputs/store-build2-edit.png`，非正式資料，不納入Git。遠端CI、合併SHA與部署健康證據以本PR最終說明及連結的run為準。

## 範圍與 Claude 檢查點

- 未修改 Worker/API/schema、正式資料、盤點呈現或月度待辦。前輪提出的清單項次／排序、紀錄密度與舊版提示移除仍待後續工作，不將本次表單返修描述為已完成那些項目。
- 請核對共用 Field 預設呈現不受影響、表頭與無障礙名稱、表格內瀏覽器必填檢查、三擇一補填後的錯誤樣式、插入／刪除中間列、手機橫捲與觸控、各瀏覽器原生日期控制項尺寸。
- 本輪是UI返修，沿用使用者授權在CI通過後合併發布；Claude審查結果仍待寫回，不代表已通過Claude。
