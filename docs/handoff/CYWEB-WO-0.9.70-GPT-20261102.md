# WO-0.9.70 GPT → Claude Handoff（2026-11-02）
## 分支與相依
- 基底：0.9.69 尚未合併的 `cyweb/wo-0.9.69-store-repairs` SHA `5cc24ac73bab`；新分支 `cyweb/wo-0.9.70-repair-photos`。PR 指向 0.9.69 分支以避免混淆 diff；待其正式整合 main 後再確認順序。
## 程式變更
- `src/ui/forms/photo-upload.ts` 共用 resizeToJpeg，`HrLeaveDialog.tsx` 改用，保留原人事灰階、1.5MB 條件。
- `worker/files/jpeg-upload.ts` 共用 JPEG 驗證與 R2 put→D1 batch 的失敗刪除；`hr-phase2b-routes.ts` 已採用，保留原人事權限。
- `migrations/0044_store_repair_photos.sql` metadata 表；`store-repair-routes.ts` 四種照片 API，認證後可讀，寫入 R2 HR_FILES、事件與 Audit。
- `StoreRepairPhotos.tsx`、`StoreRepairs.tsx`、`Icons.camera`、`store.css`：相機張數與照片對話框，拍照縮圖／上傳／刪除／點開大圖。
- `worker/backup/schema-columns.ts`、`portable-backup.ts`、`store-progress-upgrade.ts`、`validate_schema.py`、`store-backup-upgrade.test.mjs`：0044 版本 schema 與相容還原。
- `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、工單與本 Handoff：版本及待驗收證據。
## 待驗證事項
- 待計算 0044 LF／CRLF 精確 schema 指紋與執行完整 CI。需核對權限、五張上限、非 JPEG／超過 1MB、R2 補償與刪除、人事附件原行為，以及 0043→0044 還原。
- 需真實 1440／390 瀏覽器截圖、手機拍攝與照片清晰度驗收。
- 照片檔本體**未納入可攜備份**，依原 TODO 另案。未合併、未部署；Claude 審查結論須由 Claude 填寫。
