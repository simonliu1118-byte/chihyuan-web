# CYWEB V0.30.6 人事設定與班表介面修正
- 基準 main 00e4a5a5fba14254ac29082e664b2f89bbe6ebe5 V0.30.5（非先前 0.30.4）；本次 patch 0.30.6 Build 0。
- HrRosterPanel / hr-phase2a.css：國定假日粉紅色整欄（週末維持灰色），日期格不顯示名稱但 title 留供辨識；刪除人數摘要；人員設定右側新增國定假日設定，沿用 HrSettingsButton 並直達班表年度。透過既有 settings-events 刷新國定假日且保留班表未儲存草稿。例休斜線左上至右下，例／休／其他假別字置中，螢幕與列印一致，原分類及薪資規則不改。
- HrPhase2aSettings / hr-settings.css / HrSettingsButton：國定假日按日期排序，項次、名稱、日期、備註、操作；增加修改名稱及備註（既有日期不可直接改，避免刪除原日期）。門市、職稱、班別共用 ReorderHandle，空白手把欄、項次、操作，移除排序欄與輸入，滑鼠拖曳、觸控、方向鍵，放下即儲存，失敗還原；新增預設末尾。
- worker/hr/hr-settings-service.ts / hr-phase2a-routes：沿用 SUPER_ADMIN gate，PUT 完整 ID 順序驗證（含停用），D1 batch 寫 sort_order 與 audit；不重寫其他欄位。國定假日 note 500 字上限；migration 0086 NOT NULL DEFAULT 空字串，既有假日不改名。portable-backup CURRENT_MIGRATION、schema-columns 更新；舊備份欄位缺少時沿用預設。
- HrPayrollSettings：最近檢查及最近成功使用 formatDateTime（台北時間 YYYY/MM/DD HH:mm），生效/迄日 formatDate。未修健保來源 HTTP 403，本次僅介面。
- HR_MODULE_CONTRACT / HR_MODULE_DESIGN / BD-060 更新正式規格；測試新增排序批次、重複 ID 拒絕、假日備註及排序、介面契約；待 CI、Claude 審查。
- 尚未執行真實瀏覽器、列印、觸控、正式備份或正式 migration。Claude 須驗收各種欄寬、捷徑開啟班表年度、草稿保留、拖曳成功重開、斜線方向與文字置中、既有假日與備份還原。部署前需核對正式 D1 migration level 0085 及有效備份；未合併未部署。

- 補充：SettingsTable 共用殼增加可選 colgroup，短欄固定寬度；新增合成第二門市驗證三類排序，備份 round-trip 與舊 0085 缺 note 預設值測試。國定假日設定保留原共用關閉確認（班表有未儲存草稿時可能提示確認，關閉仍保留草稿）。
