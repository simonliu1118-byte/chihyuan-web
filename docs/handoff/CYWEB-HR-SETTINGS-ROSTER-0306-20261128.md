# CYWEB V0.30.6 人事設定與班表介面修正
- 基準 main 00e4a5a5fba14254ac29082e664b2f89bbe6ebe5 V0.30.5（非先前 0.30.4）；本次 patch 0.30.6 Build 0。
- HrRosterPanel / hr-phase2a.css：國定假日粉紅色整欄（週末維持灰色），日期格不顯示名稱但 title 留供辨識；刪除人數摘要；人員設定右側新增國定假日設定，沿用 HrSettingsButton 並直達班表年度。透過既有 settings-events 刷新國定假日且保留班表未儲存草稿。例休斜線左上至右下，例／休／其他假別字置中，螢幕與列印一致，原分類及薪資規則不改。
- HrPhase2aSettings / hr-settings.css / HrSettingsButton：國定假日按日期排序，項次、名稱、日期、備註、操作；增加修改名稱及備註（既有日期不可直接改，避免刪除原日期）。門市、職稱、班別共用 ReorderHandle，空白手把欄、項次、操作，移除排序欄與輸入，滑鼠拖曳、觸控、方向鍵，放下即儲存，失敗還原；新增預設末尾。
- worker/hr/hr-settings-service.ts / hr-phase2a-routes：沿用 SUPER_ADMIN gate，PUT 完整 ID 順序驗證（含停用），D1 batch 寫 sort_order 與 audit；不重寫其他欄位。國定假日 note 500 字上限；migration 0086 NOT NULL DEFAULT 空字串，既有假日不改名。portable-backup CURRENT_MIGRATION、schema-columns 更新；舊備份欄位缺少時沿用預設。
- HrPayrollSettings：最近檢查及最近成功使用 formatDateTime（台北時間 YYYY/MM/DD HH:mm），生效/迄日 formatDate。未修健保來源 HTTP 403，本次僅介面。
- HR_MODULE_CONTRACT / HR_MODULE_DESIGN / BD-060 更新正式規格；測試新增排序批次、重複 ID 拒絕、假日備註及排序、介面契約；待 CI、Claude 審查。
- 尚未執行真實瀏覽器、列印、觸控、正式備份或正式 migration。Claude 須驗收各種欄寬、捷徑開啟班表年度、草稿保留、拖曳成功重開、斜線方向與文字置中、既有假日與備份還原。部署前需核對正式 D1 migration level 0085 及有效備份；未合併未部署。

- 補充：SettingsTable 共用殼增加可選 colgroup，短欄固定寬度；新增合成第二門市驗證三類排序，備份 round-trip 與舊 0085 缺 note 預設值測試。國定假日設定保留原共用關閉確認（班表有未儲存草稿時可能提示確認，關閉仍保留草稿）。

## Build 1 追加需求
- 預設文字（排班分類）獨立備註、注意事項兩表；每筆可複選門市，依建立順序套用；每門市最多六項預設備註。migration 0087 搬移門市原注意事項範本，保留舊欄供歷史／備份；舊備份還原同步轉換。每月第一次儲存快照固定項目、注意事項；既有月份內容不因後續範本變動覆寫。舊自由備註原文唯讀保留，避免截斷。班表固定前綴不可改／刪，可填內容，自訂項目接續編號，最多六項、兩欄三列、無內部格線，單項最多200字。注意事項唯讀；員工右欄獨立月備註，保留時數合計，後端檢查門市歸屬，隨本月儲存。
- 不用來移至班別列；國定假日休按鈕顯示國定假日並放第一列（代碼國不改）；所有 leave 及 slash off 格左上至右下斜線，X 不畫。列印同步。
- 上一版 Build 0 CI 唯一失敗為 hr-current-values.test.mjs 寫死 0085，已更新至 0087。新增 D1 範本門市隔離、固定項目、上限、快照、唯讀規則、個人備註與備份驗收。尚未執行最新 CI 或實際瀏覽器；須確認兩欄三列、長文字、列印、範本生效時機與舊資料。未合併部署。

## Build 2：自動儲存與版面追加
- 參考 OrderingGrid 及 OrderingPage 的同步草稿 ref、序列化保存及僅確認已送出的版本，班表套用／清除／鍵盤修改立即排入保存，備註 blur 保存，新增刪除備註立即保存。請求中保持輸入及焦點、不 reload、不清表；回覆只移除已送的變更，保留後續輸入；失敗保留草稿、顯示重試；原違規及主管核准仍有效。切換門市／月先 flush；頁面離開守衛保留；取消只取消未成功的修改。每日人力依全門市 staged 值、班別排序逐行顯示。備註依 i/3 與 i%3 放置 1/2/3 左欄、4/5/6 右欄，未新增項目無編號。
- 修復 Build 1 source-contracts 的 schema allowlist 遺漏 hr_roster_text_defaults；Build 1 其餘必要 CI 已成功。Build 2 仍需完整 CI 與真實 UI 驗收，尤其慢網路快速連續套用、同格二次修改、跨欄 blur、核准、失敗重試、切月與列印。使用者已授權合併部署；Claude 事後審查。正式 migration 0086/0087 前須驗證既有備份。

## Build 3：部署前唯讀備份門檻
- 原 Build 2 source-contracts、前後端型別、治理、部署契約已通過；為避免正式 migration 無備份，受控發布 job 於 Apply D1 migrations 前讀取 `d1_migrations` 及本 workspace 的 backup_sets/backup_copies。0086/0087 尚未完成時須有 48 小時內建立、至少一份已標記 verified 的備份；兩 migration 均存在則略過。只輸出固定代碼，不列備份識別值、內容、憑證或正式 SQL 結果；不另行觸發備份/還原，不變更既有 recovery 目標。目錄檢查不能替代重新讀取備份物件或正式還原演練；若無最近 verified 備份，部署在 migration 之前停止。新增模擬通過、失敗與跳過測試。
- 正常儲存狀態固定一行空間，避免提示區出現時使班表上下跳動。實際瀏覽器、正式備份還原與列印未驗證。
