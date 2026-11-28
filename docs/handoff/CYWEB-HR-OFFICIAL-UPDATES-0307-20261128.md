# CYWEB V0.30.7 官方人事資料半年更新
- Base 085899cceb51dc6526da9331f120bbe1df5e1807 V0.30.6 Build 3。使用者 2026-11-28 定案每年 6/20、12/20 04:00 臺灣時間；三類手動按鈕統一「立即更新」。未授權合併部署。
- shared/cyweb-cron、worker/index：不新增 Cloudflare cron，UTC 6/19、12/19 20:00 正確對應臺灣日期，三類 Promise 獨立；原級距同步 importer 接入，沿用既有 per-kind lease、有效日期、官方驗證及保留版本。半年 claim 不會每天抓。
- worker/hr/hr-official-updates、shared/hr-official-updates：官方 DGPA 開放資料 https://data.gov.tw/dataset/14718 動態選擇本年與次年 CSV（依官方下載名稱）；依 https://www.mol.gov.tw/1607/28162/28166/28218/28226/81488/post 現行法定16日，完整年度、日期、旗標、清明、農曆與固定日期檢查。不直接匯入政府補假、個別原住民族歲時祭儀、投票日；後兩者需個別適用，保留人工。年度原檔下載在本工具環境未成功，不能宣稱正式來源 parser 已實測；需用合成測試及部署前實際下載驗收。未來法定假日數量或政府格式改變須人工確認；不以猜測替代官方來源。歷史已存在官方假日不自動刪改，缺少的本年日期仍可匯入，須核對歷史薪資影響。
- 法規：官方 14 個法源修正／公布日期監測，初次與異動待人工核對，既有待核對旗標保留；不代表已完成所有條文／函釋與系統邏輯審查，未提供核銷待核對功能，需另案審查。來源失敗保留上次成功；未調整既有健保 403。
- Migration 0088：人工 source 預設、排除日期、更新狀態，現有假日資料保留。管理員手動新增/修改轉 manual，手動刪除排除，重建解除排除。備份欄位、allowlist、舊備份 restore 與 deployment backup gate 更新。需先查正式備份。
- HrPhase2aSettings、HrPayrollSettings、HrLegalWatchSettings、HrSettingsButton：共用設定殼，最近檢查／成功、來源、錯誤及待人工核對，三者「立即更新」；國定假日另保留新增。全部透過 SUPER_ADMIN 現有路由。
- 待 CI、真實官方來源/畫面與 Claude 審查，未合併未部署。