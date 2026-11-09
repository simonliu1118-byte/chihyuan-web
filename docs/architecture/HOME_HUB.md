# CYWEB 工作中心首頁、公告與通知、個人待辦（V0.13.0）

2026-11-08 使用者確認。單一 React/CYWEB Worker/D1，依既有 CYID Session 與 CYWEB Module Access 授權，不創立第二套帳號或通知實作。

## 首頁與路由

- 登入後沒有指定 Hash 時導向 #home；點左上 CY 回首頁，桌機側邊欄與手機上方均可操作。
- 既有深層連結可以直達原模組，切換走原有 guarded hash navigation；ERP 與 Ordering kept-mounted 查詢不能被首頁卸載。
- 首頁包含歡迎與日期、逾期及今日待辦數、未讀個人通知與公司公告數、個人待辦預覽、授權模組捷徑、兩張**分開**的公司公告與個人通知卡片。
- 點首頁「新增待辦」導向 #my-todos?new=1；查看全部到 #my-todos；點項目到 #my-todos?id=N。首頁不出現新增或編輯快速視窗。
- 待審跨模組 KPI 尚無共同摘要契約，先不讀取 ERP/BOT 大量歷史以拼湊數字，留待後續各模組自有輕量統計契約。

## 公告與通知

- 左側只有一個「公告與通知」入口，前台是「公司公告」與「個人通知」兩個獨立頁籤；編輯表單固定類型，沒有同頁切換通知發送範圍的控制。
- 後端共用 hub_notices、hub_notice_recipients、hub_notice_reads：公司公告對所有 CYWEB 有效登入者可見，不須逐人寫入收件匣；個人通知僅指定收件人能閱讀；發送者可以從自己的發送紀錄查看與撤回。
- 兩項獨立授權 ANNOUNCEMENT_PUBLISH（公司公告發布）及 PERSONAL_NOTICE_SEND（個人通知發送）；透過既有員工／群組 Module Access 勾選。SUPER_ADMIN 隱含全部權限；其他角色沒有授權只能閱讀，Worker 每次重驗，不能只靠按鈕隱藏。
- 個人通知最多指定 50 位有效收件人，發送 D1.batch 同時寫入通知、收件者與審計事件；已發送內容不可修改，可撤回後重發。個人通知沒有回覆／聊天室功能。
- 目前可選收件人限有效 CYWEB app_members projection。尚未登入或未建立本地 projection 的 CYID 員工不一定在清單中；未來若需涵蓋全部員工，必須有獨立最小權限的 CYID 名錄契約，不能把 CYID 管理員 API 提供給一般發送者。
- 點開通知才寫 hub_notice_reads，鈴鐺打開不會標記已讀；撤回後收件人看不到原通知。個人發送紀錄及收件已讀資訊只向原發送者或 SUPER_ADMIN（且具有相應授權）開放；SUPER_ADMIN 也可查看別人發送的已讀名單並撤回（2026-11-09 修正）。
- **新進員工只算到職日之後的公告**（使用者 2026-11-09）：到職日取人事資料 `hr_employees.hire_date`（以台灣時間 00:00 計），未綁定人事資料時取加入 CYWEB 的時間。到職日之前的公司公告視為已讀，不計入鈴鐺與首頁未讀數，清單仍可查閱。

## 個人待辦

- 所有登入 CYWEB 的使用者都可用，無需額外模組權限；帳號選單內有「我的待辦事項」，左側不另新增目錄。
- 在正式待辦頁進行新增、編輯、完成、復原、刪除與歷史查詢；可記錄標題、選填詳情、日期、時間及優先程度。編輯用表格式 `EntryTable`；時間用共用 `TimeInput`（24 小時 HH:MM）。公告／通知的撰寫同樣用 `EntryTable`。
- Worker 中每一個 Todo CRUD 均依目前 principal 對應的 member_id 查詢／更新；即使知道其他人的數字 ID 也不得讀取。其他人（包括一般管理員）不能管理他人的私人待辦。
- 無期限待辦只在首頁／正式頁預覽，不列入鈴鐺；只有今日到期或逾期且未完成的事項才計入提醒數。

## 鈴鐺

- 站內浮動提醒清單預設讀五筆，還有更多則每次讀十筆；有最大高度與垂直捲動。未處理總數直接依 DB 取得，與目前載入幾筆無關，圖示數字超過九筆顯示 9+。
- 排序依序：逾期未完成待辦、未讀個人通知、未讀公司公告、今日到期待辦。同類別再依時間倒序與唯一 ID 游標，讀取採有限量 UNION SQL 而非把所有歷史下載至前端。
- 點擊提醒只到所屬正式頁，不能在鈴鐺裡完成／編輯／發送／回覆／整批設已讀。
- 前景每 60 秒更新，取得焦點或站內相關操作成功時也更新；不要求手機通知權限、不使用背景 Web Push。

## 資料、備份與限制

- D1 0059_home_hub.sql 擴充 app_member_module_access 的 CHECK 清單，保留原有 grants，新增 personal_todos、hub_notices、hub_notice_recipients、hub_notice_reads 四表及索引。
- 這四表屬持久正式業務資料，納入 CYWEB 可攜備份 schema-columns；最新 migration marker 同步。備份中含私人內容，沿用既有備份保密與還原保護，不能將真實資料放入公開 Git 或測試附件。
- 所有 API 位於 /api/hub/，先通過 CYID Identity 與 active app member，限制 JSON 大小、本文長度、收件人上限及列表頁數；不改既有 BOT、ERP、Identity、Webhook secret、Worker 與 D1 名稱。
- 2026-11-09：Claude 依審查紀錄修正後，以最新 main 重整為 V0.13.0，經使用者授權合併部署並套用 0059。