# V0.9.57 Build 3 — 訂購表格標題列與備註尺寸返修

日期：2026-10-31（Asia/Taipei）。使用者直接指示刪除「基本資料」列、讓備註不可拖曳改變大小，並將新增／修改訂購視窗減少20%寬度。沿用本對話單純UI返修可合併部署授權；Claude尚未複審。

## 修改

- `src/runtime/modules/StoreCustomerOrders.tsx`：新增／修改訂購刪除獨立「基本資料」標題列，直接從訂購日期／顧客姓名／電話／手機／LINE表頭開始。內嵌表格保留無障礙名稱，資料欄位與驗證不變。
- `src/runtime/modules/store.css`：僅訂購表格底部備註textarea設`resize:none`，保留原兩列高度與輸入能力，不影響其他表單的textarea。
- 同檔將訂購視窗最大寬1050px→840px，縮小20%；保留窄螢幕100vw−32px上限與表格內層捲動。
- `BUILD`：2→3，VERSION維持0.9.57，屬同一訂購表單UI返修。
- `docs/handoff/README.md`：加入本輪交接索引。

## 驗證與發布

- `npm run build`通過browser／Worker TypeScript與Vite建置（既有bundle warnings）；既有訂購表單／共用表單與鍵盤測試13/13通過；git diff --check通過。合併／發布run連結寫於本PR最終說明。
- 實際in-app browser以合成資料、1200px viewport核對：surface840px、table802px、基本資料獨立標題列0列、備註computed resize=none；修改理由仍在上方，表格及底部合計對齊。未操作正式訂單；圖片留在聊天outputs，不納入Git。
- 此為一列移除與局部CSS修改，不另新增鏡像實作的測試；無API、資料庫、正式資料或月度待辦修改。
- Claude請核對新增／修改兩種視窗皆無獨立標題列、備註固定尺寸與文字仍可輸入、840px欄位對齊。Claude審查結果待寫回，不由執行者代填通過。
