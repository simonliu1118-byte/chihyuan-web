# CYWEB V0.30.7 官方人事資料半年更新
- Base 085899cceb51dc6526da9331f120bbe1df5e1807 V0.30.6 Build 3。使用者 2026-11-28 定案每年 6/20、12/20 04:00 臺灣時間；三類手動按鈕統一「立即更新」。未授權合併部署。
- shared/cyweb-cron、worker/index：不新增 Cloudflare cron，UTC 6/19、12/19 20:00 正確對應臺灣日期，三類 Promise 獨立；原級距同步 importer 接入，沿用既有 per-kind lease、有效日期、官方驗證及保留版本。半年 claim 不會每天抓。
- worker/hr/hr-official-updates、shared/hr-official-updates：由 https://data.gov.tw/dataset/14718 動態選擇本年與次年 CSV（依官方下載名稱）。依 https://www.mol.gov.tw/1607/28162/28166/28218/28226/81488/post 核對 16 天法定假日，先檢查年度完整性、日期與放假旗標。政府補假、個別原住民族歲時祭儀及投票日繼續由人工管理。官方格式或法定假日數量變更時，需人工核對。歷史已存在的官方假日予以保留，當年度缺少的假日仍可匯入，須核對歷史薪資影響。
- 法規：官方 14 個法源修正／公布日期監測，初次與異動待人工核對，既有待核對旗標保留；不代表已完成所有條文／函釋與系統邏輯審查，未提供核銷待核對功能，需另案審查。來源失敗保留上次成功；未調整既有健保 403。
- Migration 0088：人工 source 預設、排除日期、更新狀態，現有假日資料保留。管理員手動新增/修改轉 manual，手動刪除排除，重建解除排除。備份欄位、allowlist、舊備份 restore 與 deployment backup gate 更新。需先查正式備份。
- HrPhase2aSettings、HrPayrollSettings、HrLegalWatchSettings、HrSettingsButton：共用設定殼，最近檢查／成功、來源、錯誤及待人工核對，三者「立即更新」；國定假日另保留新增。全部透過 SUPER_ADMIN 現有路由。
- 待 GitHub CI、Cloudflare 環境中的來源連線與畫面驗收，以及 Claude 最終審查。草稿 PR 尚未合併或部署。

## V0.30.7 Build 1

- [首輪 Runtime Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/46124169230) 的兩項假日測試共用同一個失敗原因。執行環境的農曆換算把 2027 年初一算成 2 月 7 日。[人事行政總處公告](https://www.dgpa.gov.tw/information?pid=12983&uid=2) 的初一是 2 月 6 日，2 月 9、10 日為政府補假。
- `worker/hr/hr-official-updates.ts` 以官方 CSV 備註辨識春節、端午和中秋。春節須有依序連續的五日，端午及中秋各須有唯一日期。日期範圍、放假旗標及全年筆數仍受檢查。若官方備註格式改動而無法辨識，該年度回報錯誤並保留既有資料。
- `scripts/hr-official-updates.test.mjs` 改用官方格式的節日與補假備註，驗證 2027 年 2 月 9、10 日排除及節日資料缺漏時停止匯入。`BUILD` 升為 1，`CHANGELOG.md` 記錄返修內容。
- 本機四項人事官方更新測試、瀏覽器及 Worker TypeScript 檢查、Vite 建置通過。使用政府資料開放平臺的頁面與人事行政總處 2026、2027 年原始 CSV，各以下載檔與即時 HTTPS 讀取執行相同匯入程式，在本機測試資料庫驗證共 32 天。官方來源測試涵蓋假日匯入，法定級距及人事法規的 Worker 連線仍待驗收。
