# V0.9.57 Build 4 — 數字欄箭頭、操作紀錄與黑名單表格返修

日期：2026-10-31（Asia/Taipei）。使用者要求移除數量／單價／訂金上下箭頭，並指出先前要求刪除的舊版操作紀錄提示仍在。本輪一併補齊先前已要求的紀錄小字與緊行距。沿用UI返修可合併部署授權；Claude尚未審查。

## 修改與行為

- `src/runtime/modules/StoreCustomerOrders.tsx`：刪除「舊版紀錄不完整；此處顯示改版後的操作。」及History的legacy呈現參數；舊單／新單皆不再顯示該句。API／資料的legacy欄位不動。空紀錄統一顯示「尚無操作紀錄」，可同時用於訂購與黑名單。
- `src/runtime/modules/store.css`：只在訂購輸入表格中用appearance:textfield及WebKit spin pseudo-elements隱藏數量／單價／訂金的原生箭頭；保留type=number、min／max／step／required、計算與送出資料型別，不影響其他表單。
- 同檔操作紀錄使用既有xs字級、line-height1.3，縮小段落／列表間距及padding。既有展開／收合、分頁與事件內容保留。
- 使用者工作中追加：黑名單新增／修改改用訂購相同EntryTable／Field cell呈現，第一組姓名／電話／手機／LINE四欄表頭與輸入列，第二組處置一欄、單行理由合併其餘三欄，不再重複格內標籤。視窗最大840px與訂購一致。
- 抽出同模組ContactCells供訂購／黑名單共用三擇一驗證；全空送出才由共用Feedback阻擋。修改既有黑名單處置時，保留必填的修改處置理由，放在表格上方；訂購取消轉入黑名單的預填、原子儲存及原處置保護不變。
- `scripts/store-page.test.mjs`：配合共用ContactCells展開測試，新增獨立黑名單表格僅LINE聯絡／其他處置儲存案例；保留既有取消轉入黑名單原子請求與既有黑名單不改原處置測試。
- `BUILD`：3→4，同一訂購UI返修；VERSION仍為0.9.57。`docs/handoff/README.md`新增索引。

## 驗證與發布

- `npm run build`通過browser／Worker TypeScript及Vite（既有bundle warnings）；訂購／共用表單與鍵盤14/14通過，git diff --check通過。新增黑名單測試首次因測試text helper未處理React數字節點而找不到「黑名單 0」，修正helper後全數通過，非產品失敗。CI與部署run連結見本PR最終說明。
- 真實in-app browser、合成transport驗收：黑名單surface840px，六個表頭、格內重複label可見數0；姓名／理由填妥但聯絡全空時儲存才警告，補LINE後儲存成功，處置可選其他。未操作正式黑名單。
- 使用legacy=true合成訂單展開紀錄，舊提示不存在；空紀錄僅「尚無操作紀錄」，computed字級12px、行高15.6px。原生數字欄編輯狀態實際截圖無上下箭頭，三欄computed appearance=textfield，type=number、min／max／step／required仍保留。
- 合成截圖：聊天outputs/store-build4-blacklist.png、store-build4-history.png、store-build4-numbers.png，不納入Git。已關閉自建tab、重設viewport並停止本機server。
- 本輪無後端／migration／正式資料修改。先前清單項次及排序仍不在此返修範圍，月度待辦待使用者繼續討論。
- Claude請核對舊單不再顯示提示、紀錄密度、三個數字欄focus／hover皆無原生箭頭，且數值驗證仍正常。Claude審查不得由執行者代填通過。
