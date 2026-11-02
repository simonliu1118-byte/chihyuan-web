# CYWEB WO-0.9.68 — 給 Claude 的 GPT 實作交接（2026-11-02）
## 身分與範圍
- base：main ba5c50cc25bb；分支：cyweb/wo-0.9.68-monthly-layout；PR 建立後於工單回填。
- 唯一需求來源：docs/development/work-orders/WO-0.9.68.md；不合併、不部署。
## 修改檔案與原因
- shared/store-monthly.ts：新增週期歷史型別、當月有效週期、單月/雙月/自訂判斷，統一 monthlyApplicable。
- worker/http/store-monthly-routes.ts：設定週期與自訂月份輸入驗證；只在設定有異動時增加／覆寫當月歷史，舊資料維持每月。
- worker/store/monthly-service.ts：monthlyMaterialization SQL 依同一週期語意建立辦理格，保留既有格與完成紀錄。
- src/runtime/modules/StoreMonthlyTodos.tsx / store-monthly.css：可用寬度分組、項目名稱與辦理格配對、跨列年月/門市、粗線分隔、逾月淡紅，設定使用共用 SegmentedControl／CheckField。
- scripts/store-monthly*.test.mjs：主要行為、D1、週期歷史、分組與設定交互測試。
- VERSION/package.json、TODO.md、CHANGELOG.md 與本工單：版本與工作紀錄。
## 結構約束
- 不建立第二套狀態／日期元件；既有日期編輯與操作紀錄保持原邏輯。
- 不新增 migration：沿用 items_json 中 schedules；過去月份使用既有資料與 fallback。
- 請檢查 desktop/tablet/mobile 分組、sticky 年月與操作、date popover、日期可修正／無日期、設定週期選擇與完成紀錄回讀。
## 驗收與尚待事項
- 待 PR CI 結果回填。工作單要求的 1440、1024、390 真瀏覽器截圖尚未執行；不得視為驗收通過。
- 若 Claude 發現問題請寫入工單 §9，返修由 GPT 進行。未合併、未部署。
