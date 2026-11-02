# CYWEB WO-0.9.68 — 給 Claude 的 GPT 實作交接（2026-11-02）
## 身分與範圍
- base：main ba5c50cc25bb；分支：cyweb/wo-0.9.68-monthly-layout；PR #351：https://github.com/simonliu1118-byte/chihyuan-web/pull/351。
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
## CI／回歸驗證證據
- [Runtime #41415275951](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41415275951)：完整 Node **564／564 通過、0 失敗**，Local D1 runtime acceptance、Vite Build、前端與 Worker TypeScript、Source Contracts 均通過。
- [Governance #41415275623](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41415275623)：成功。
- [CY Web Deploy PR preflight #41415275634](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41415275634)：validate-deployment-contract 成功；deploy-development SKIPPED（**未部署**）。
- 首輪 #41414923761 為 562／564，失敗僅為新增 ✓ 日期與新增週期標題後兩項舊 UI 文字／欄數預期值，已更新測試並確認後續 564／564 通過。
## 仍待 Claude 複審／人工驗收
- 真實瀏覽器 1440／1024／390 截圖：**尚未執行，無截圖附件**；請依工單 §7 驗證 15 項換行、年月／門市跨列、粗線分隔、手機水平捲動、設定自訂週期展開。
- 登入後的日期 Popover、無日期、取消完成、移動端觸控、深淺背景與資料回讀尚未由真實裝置驗收，不得用合成測試冒充通過。
- 請重點檢查週期歷史與 D1 物化週期條件一致（從當月生效，過去紀錄保留）、舊 items_json fallback、設定批次原子寫入。
- 工單 §9 專供 Claude 留審查結果；GPT 尚未合併或部署。
