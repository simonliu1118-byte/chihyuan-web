# WO-0.9.70 售後維修：拍照上傳維修單

- 狀態：程式與 CI 571／571 通過，待 Claude 複審及真實瀏覽器驗收；0.9.69 尚未合併
- 分支：cyweb/wo-0.9.70-repair-photos　PR：[ #356 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/356)
- 含 migration 與 API：**Claude 審查通過後才合併部署**。

## 1. 背景（使用者原話）

- 「維修這邊完成之後要提供一個上傳維修單，可以拍照上傳留檔」
- 「留意檔案不要太大 能看清楚就好」

## 2. 已定案事項

- 每張維修單可上傳**維修單照片**，最多 **3 張**（使用者 2026-11-03 由 5 張改為 3 張），任何階段都能上傳，結案後也能補傳。手機直接拍照（`<input type="file" accept="image/*" capture="environment">`），電腦可選檔。
- **大小控制在前端完成**：上傳前縮圖並轉 JPEG。
  - 長邊最多 **1600px**，品質 0.8；
  - 縮圖後仍超過 **1 MB** 就拒絕，提示「照片過大，請重新拍攝」；
  - 一般手機拍的單據約 200–400 KB，文字清楚可讀。
  - 不轉灰階，維修單可能有彩色蓋章。
- **後端再檢查**：只收 JPEG、不超過 1 MB、長邊不超過 2000px（沿用人事附件的 `jpegSize` 檢查）。
- **儲存**：沿用既有 R2 binding `HR_FILES`，路徑前綴 `store-repairs/<維修單id>/<uuid>.jpg`，不新建 Cloudflare 資源。照片只能透過有 `STORE_REPAIRS` 權限的 API 讀取，回應帶 `cache-control: private, no-store`。
- **刪除**：誤傳可刪除，照片從 R2 一起刪掉，記操作紀錄與 Audit。
- **顯示**：
  - 清單「操作」欄**不增加按鈕**。在「送修產品」旁顯示小相機圖示＋張數（例如「📷2」，用共用 `Icons`，新增 `camera` 圖示），點開照片對話框。
  - 照片對話框：縮圖格狀排列，點縮圖看大圖；有「上傳照片」「刪除」按鈕。
- **備份**：
  - 照片的「紀錄」（D1 表）納入可攜備份；
  - **照片檔本身不納入**，與人事附件相同，列在既有 TODO「附檔備份另案處理」。

## 3. 範圍

- **Migration `0044_store_repair_photos.sql`**：`store_repair_photos`（id、repair_id FK、object_key UNIQUE、bytes、width、height、created_at、created_by）、索引 (repair_id, id)。
- **備份**：
  - 新表登記 `schema-columns.ts`、`validate_schema.py`；
  - **0044 會改變結構指紋**：照 0042／0043 的方式加 LF／CRLF 指紋，舊備份還原時新表補空，並補「0043 備份可還原到 0044」測試。
- **共用（先抽再用）**：
  - 前端：把 `HrLeaveDialog.tsx` 的 `resized()` 抽成 `src/ui/forms/photo-upload.ts` 的 `resizeToJpeg(file,{maxSide,quality,grayscale})`；人事改用它，行為不變。
  - 後端：把 `hr-phase2b-routes.ts` 的 `jpegSize` 與「放 R2 → 寫 D1、失敗就刪 R2」的流程，抽成 `worker/files/jpeg-upload.ts`；人事附件改用它。
- **API**，在 `/api/business/store/repairs/:id/photos`：
  - `GET` 列表；
  - `POST` 上傳（body 為 JPEG，張數上限 5）；
  - `GET /photos/:photoId` 取得檔案；
  - `DELETE /photos/:photoId`。
  
  上傳與刪除都寫 `store_repair_events`（「上傳維修單照片」「刪除維修單照片」）與 Audit。
- **前端**：清單的相機圖示與張數、照片對話框（共用 `Dialog`、`IconButton`、`Loading`）。
- **測試**：
  - 張數上限、非 JPEG／過大拒絕；
  - 刪除會一併刪 R2；
  - 權限；
  - 備份還原；
  - 人事附件改用共用函式後原測試照過。

## 4. 不做

- 不做 OCR、不做 PDF、不做照片編輯或旋轉（以手機拍攝方向為準）。
- 不納入照片檔的備份（另案）。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。只做本單要求的功能與實際會發生的錯誤處理；不加重複驗證、不會發生的情境測試。

## 5. 實作指引

- 圖示從 `src/ui/actions/icons.tsx` 取，新增 `camera` 放在那裡；**不要在模組內寫 `<svg>`**。
- 照片網址用 `fetch` 取 blob 再 `URL.createObjectURL`（身分驗證走 cookie），對話框關閉時 `revokeObjectURL`。
- 新 migration 編號 0044；版本接續 0.9.69 之後。

## 6. 驗收清單

- [ ] 手機可直接拍照上傳；上傳後的照片 ≤ 1 MB、長邊 ≤ 1600px，文字清楚。
- [ ] 每張維修單最多 3 張；可刪除；結案後可補傳。
- [ ] 清單顯示相機圖示＋張數，點開可看大圖。
- [ ] 沒有 `STORE_REPAIRS` 權限無法讀取照片。
- [ ] 人事請假附件改用共用函式後行為不變。
- [ ] 0043 備份可還原到 0044。
- [ ] 固定項目：新表單按 Enter 跳下一欄、日期欄位四碼年份（`PROJECT_RULES.md` §5，`form-keyboard.test.mjs` 會檢查）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。
- [ ] `node --test scripts/*.test.mjs` 通過。
- [ ] VERSION／package.json 版本、TODO 段落已更新。

## 7. 截圖要求

- 桌面 1440、手機 390：清單的相機圖示、照片對話框（含 3 張縮圖與放大）。

## 8. 完成報告（GPT，2026-11-02）

- **交付：** [PR #356](https://github.com/simonliu1118-byte/chihyuan-web/pull/356)；分支 `cyweb/wo-0.9.70-repair-photos`，**base 是尚未合併的 WO-0.9.69** (`cyweb/wo-0.9.69-store-repairs` SHA `5cc24ac73bab`)。WO-0.9.70 的正式工單原文從 main 引入相依工作分支，不覆寫 Claude 規格；版本 `0.9.70`／BUILD `0`。
- **共用先行：** `src/ui/forms/photo-upload.ts` 提供 `resizeToJpeg`，人事 `HrLeaveDialog.tsx` 已改用，保留原灰階、1.5 MB；`worker/files/jpeg-upload.ts` 提供 `jpegSize`／`inspectJpeg`／`putJpegWithRecords`，人事附件與維修照片共用，維持 R2 失敗補償。沒有新增第二份獨立實作。
- **維修照片：** 新增 `0044_store_repair_photos.sql`（Metadata、FK、索引），照片實體沿用 `HR_FILES`，路徑 `store-repairs/{repairId}/{uuid}.jpg`；API 經 `STORE_REPAIRS` 權限守門，包含列表、JPEG 資源、上傳與刪除，上傳及刪除寫事件與 Audit；照片 GET 為 `private, no-store`。前端提供手機相機、1600px／JPEG 0.8、單張 1MB、最多五張、清單相機及張數、縮圖與放大、刪除；結案後仍可補傳。
- **備份：** D1 照片 metadata 新表加入 `schema-columns.ts`、`validate_schema.py`、`portable-backup.ts`，0043→0044 舊備份自動補空新表；0044 LF `a2ec97475e6a855df30d1964819d97f8a1735de8141e1bb7fc8685ce1862488b`，CRLF `8e2751fac3de1cfc294cd5039c61cd0d66f0cfb2ee2bc17139f517abe606f15b`，已依 CI 實際輸出登錄並在測試驗證。JPEG 本體**不備份**，保留既有「附檔備份另案處理」政策。
- **實際自動驗證：** [Runtime Check #41426118458](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41426118458)：**Node 571／571、0 失敗**；本機 D1 runtime acceptance、browser／worker TypeScript、source contracts、Vite build 全部通過。測試涵蓋 0043 備份還原、維修照片五張上限／拒絕錯誤 JPEG／超限大小／刪除 R2／權限／結案補傳及人事既有回歸。
- **剩餘人工驗收：** [ ] 桌面 1440／手機 390 的真實瀏覽器畫面、3 張縮圖與大圖、實際手機拍攝、照片可讀性；**尚未取得截圖，不代表實機驗收通過**。 [ ] Claude 對照 §6／§7、PR、R2 與 D1 一致性及安全性複審，意見填 §9 與 [Handoff](../../handoff/CYWEB-WO-0.9.70-GPT-20261102.md)。
- **權限與部署：** PR 僅供 Claude 複審；**尚未合併、未部署、未建 Release**。WO-0.9.69 須先完成審查及受控合併部署；此後再調整 PR base 並依使用者授權處理。

## 9. 審查紀錄（審查者填）

- 日期：2026-11-03；審查者：Claude；PR #356。
- 結論：**通過**（含 Claude 直接修正）。
- 確認無誤：
  - **共用抽取**：前端 `resizeToJpeg`、後端 `inspectJpeg`／`putJpegWithRecords`，人事請假附件已改用，行為不變。
  - **權限與存取**：照片 API 都在 `STORE_REPAIRS` 權限後，回應為 `private, no-store`；上傳失敗會刪掉 R2 上的檔案；上傳與刪除都有事件與 Audit。
  - **前端**：object URL 關閉時會釋放；圖示用共用 `Icons.camera`。
- Claude 直接修正：
  1. **阻擋：0044 結構指紋沒填**（`STORE_REPAIR_PHOTO_SCHEMAS` 是空陣列）。任何備份（包括部署後新做的）都無法還原，13 項備份測試失敗，CI 的 build job 也沒有通過。GPT 在審查期間同步補上（0de47e7），數值與 Claude 從 migration 鏈重算的一致。
  2. **使用者 2026-11-03 指示每筆最多 3 張**：改為常數 `STORE_REPAIR_PHOTO_LIMIT=3`，後端、前端、測試、工作單、CHANGELOG 同步修改。
  3. **清單的相機張數一律顯示 0**：清單 API 沒回傳張數。已在清單查詢加上 `photo_count` 子查詢。
  4. **刪除照片沒有確認**：一按就刪，而且 R2 的檔案也一起刪掉、無法復原。已改用共用 `useConfirmation` 先確認。
- 驗證：
  - `npm run typecheck`、`node --test scripts/*.test.mjs`（571 pass）、`validate:source`、`validate_schema.py`（45 支 migration）、`validate:d1:local`、`npm run build` 通過；
  - 本機截圖：照片對話框（2／3 張）。
- 流程：**PR 交審時 CI 並未全綠**（build job 未通過）。之後交審前請確認最新 head 的 CI 全綠。
