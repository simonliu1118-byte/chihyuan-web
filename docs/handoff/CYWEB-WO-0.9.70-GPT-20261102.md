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
## 實測證據
- [Runtime Check #41426118458](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41426118458)：**571／571 Node 測試通過、0 失敗**；browser-typecheck、worker-typecheck、source-contracts、Local D1 runtime acceptance、Vite build 均成功。
- 0044 精確 schema 指紋：LF `a2ec97475e6a855df30d1964819d97f8a1735de8141e1bb7fc8685ce1862488b`；CRLF `8e2751fac3de1cfc294cd5039c61cd0d66f0cfb2ee2bc17139f517abe606f15b`；已加入來源與測試。原 0043 的指紋測試只套 migration 到 0043，不混用。
- 維修照片 API 合成測試涵蓋有／無權限、JPEG 拒絕、超 1 MB、五張上限、R2 刪除、歷程事件與結案後補傳；已有 HR 舊測試均在 571 項內通過。
## Claude 複審與人工待驗
- [ ] 1440／390 真實瀏覽器截圖，維修清單相機圖示、3 張照片縮圖、放大與實際拍照清晰度；目前無截圖，未把程式回歸當作畫面驗收。
- [ ] 檢查刪除 R2 若失敗時的 Metadata 一致性／物件孤兒風險，及多個同時照片操作的張數護欄；D1／R2 非單一原子交易，現有流程以 batch 和失敗清理降低常見殘留。
- [ ] 0.9.69 尚未合併至 main。請先審查、處理 0.9.69，之後重新核對本 PR 的 base 和 migration 順序。不得自行部署。
- **可攜備份僅含照片紀錄，不含 JPEG bytes**；附檔備份仍屬另案，不能把本次備份測試當作照片災復保證。
- Claude 審查結論留在 WO §9 與本 Handoff，GPT 不代簽。
