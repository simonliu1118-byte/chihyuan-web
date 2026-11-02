# WO-0.9.70 售後維修：拍照上傳維修單

- 狀態：相依分支實作中／待 CI 與 Claude 審查；0.9.69 尚未合併
- 分支：cyweb/wo-0.9.70-repair-photos　PR：#（執行者填）
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

## 8. 完成報告（GPT，2026-11-02，待驗證）
- 依 0.9.69 工作分支建立相依分支 `cyweb/wo-0.9.70-repair-photos`，以保留正式 main 未有 0.9.69 的審查界線。WO70 原文由 main 搬入本分支以供審查。
- 抽出 `src/ui/forms/photo-upload.ts`、`worker/files/jpeg-upload.ts` 共用 JPEG 處理與補償流程；人事假單已沿用。
- 新增 0044 metadata migration、維修照片 API、R2 HR_FILES、相機張數與縮圖／大圖／刪除對話框。
- 備份只納入 D1 metadata；JPEG 檔案備份另案。完整 CI、指紋與人工照片驗收待確認，**不視為通過**。
- 交接 `docs/handoff/CYWEB-WO-0.9.70-GPT-20261102.md`；第 9 節由 Claude 複審。未合併、未部署、未發 Release。



## 9. 審查紀錄（審查者填）

- 日期：2026-11-03；審查者：Claude；PR #356。
- 結論：**通過**（含 Claude 直接修正）。
- 確認無誤：
  - **共用抽取**：前端 `resizeToJpeg`、後端 `inspectJpeg`／`putJpegWithRecords`，人事請假附件已改用，行為不變。
  - **權限與存取**：照片 API 都在 `STORE_REPAIRS` 權限後，回應為 `private, no-store`；上傳失敗會刪掉 R2 上的檔案；上傳與刪除都有事件與 Audit。
  - **前端**：object URL 關閉時會釋放；圖示用共用 `Icons.camera`。
- Claude 直接修正：
  1. **阻擋：0044 結構指紋沒填**（`STORE_REPAIR_PHOTO_SCHEMAS` 是空陣列）。任何備份（包括部署後新做的）都無法還原，13 項備份測試失敗，CI 的 build job 也沒有通過。已填入 LF／CRLF 指紋（Claude 從 migration 鏈重算），並把「目前結構指紋」測試改為 0044。
  2. **使用者 2026-11-03 指示每筆最多 3 張**：改為常數 `STORE_REPAIR_PHOTO_LIMIT=3`，後端、前端、測試、工作單、CHANGELOG 同步修改。
  3. **清單的相機張數一律顯示 0**：清單 API 沒回傳張數。已在清單查詢加上 `photo_count` 子查詢。
  4. **刪除照片沒有確認**：一按就刪，而且 R2 的檔案也一起刪掉、無法復原。已改用共用 `useConfirmation` 先確認。
- 驗證：
  - `npm run typecheck`、`node --test scripts/*.test.mjs`（571 pass）、`validate:source`、`validate_schema.py`（45 支 migration）、`validate:d1:local`、`npm run build` 通過；
  - 本機截圖：照片對話框（2／3 張）。
- 流程：**PR 交審時 CI 並未全綠**（build job 未通過）。之後交審前請確認最新 head 的 CI 全綠。
