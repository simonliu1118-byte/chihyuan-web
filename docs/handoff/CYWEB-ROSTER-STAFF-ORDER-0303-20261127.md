# CYWEB V0.30.3 門市人員排序修正
- 基準 main 2d02f00f08e9ed7fc322ec3db7e2ea0dd59ce1cc（V0.30.2 Build 1 已部署）；新 bug patch 0.30.3 Build 0。
- 使用者指出兩位不同職稱員工的手把無法拖曳，要求手把獨立無表頭欄、項次置於其右、視窗 medium。
- 根因：前端同職稱限制停用手把，Worker 查詢職稱排序優先，即使前端允許跨職稱仍會在重讀時恢復原職稱順序。
- 修改 HrRosterPanel.tsx：允許門市內跨職稱排序，滑鼠拖曳、觸控放開定位與方向鍵走同一 moveStaff；取消不寫、儲存批次寫；分開手把／項次兩欄，medium 560px。hr-phase2a.css：欄寬及正常內距，排班規則選單加寬。
- Worker HrRosterService：ORDER BY roster_sort, job-title sort, id；未手動排序且同值時維持既有職稱排序。明確排序優先於職稱分組；更新 BD-060 #12 及索引以記錄本次需求解讀。既有 roster_sort 欄位直接使用，無 migration、無 API 變更、不影響職稱主檔。先前各職稱各自排序值不同時，首次載入可能依新排序優先而調整相對位置，使用者可重新拖曳儲存。
- 驗證：hr-ui-fixes.test.mjs 更新 UI 契約；hr-phase2a-acceptance.ts 新增兩位不同職稱員工雙向互換並讀回，保留既有批次原子性測試。尚未執行本地瀏覽器／D1，待 CI；Claude 必須實際驗收滑鼠與觸控拖曳、取消、儲存重開、月班表順序、選單文字及 medium 版面。不得用 source contract 代替實際畫面。
- 未合併、未部署；Claude 審查待填。
