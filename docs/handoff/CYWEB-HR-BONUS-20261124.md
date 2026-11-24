# V0.26.0 獨立獎金與每月薪資重複區塊修正

狀態：工程完成、待 Claude 審查。未合併、未部署、未操作正式 D1。

分支：`cyweb/hr-bonus-payments`。相依 PR：[#546](https://github.com/simonliu1118-byte/chihyuan-web/pull/546)，基準 `462501d2f4275a4ea2e99058d4383f620ae3b8ef`。本 PR 先以 #546 分支為 base，避免重複呈現其已交付差異；#546 合併後再改指 main 並核對版本與 migration。不得單獨跳過 0081 套用本版。

版本：V0.26.0 Build 1（Build 0 為首版）。獨立獎金發放、整批員工選擇與發放快照構成新的完整能力，依共通版本規則升 Minor；不是前版返修。Claude 尚未填審查結論。

## 使用者定案與完成行為

- 員工第一排：特休與補休／薪資／獎金；第二排：狀態異動兩格寬，在年資不計左方。窄螢幕同一組卡片調整欄數。
- 獎金卡最近三筆及查看全部。員工個別新增和薪資頁的「獎金發放」／「統一發放獎金」使用相同編輯器、API、計算與保存流程。
- 發放日期、項目、可選歸屬年度；逐名員工金額與備註，可套用統一金額。六種預設項目依使用者順序；其他顯示自填欄，保存自填名稱。
- 草稿預覽應發、所得稅、補充保費、實領及待補。已發放鎖定，附原因作廢保留原紀錄，再另建正確發放；批次動作均整批生效，不是銀行匯款。
- **每月薪資不再出現「本次另發非每月獎金」輸入，也不送 bonusAmount；伺服器拒絕非零值。沒有新增「隨薪資／另行發放」選項。**
- 舊已發薪月薪的 JSON、日期、備註及獎金維持原快照，仍從原月薪明細查看，不把舊獎金複製成獨立獎金再計一次。未發薪舊獎金稿需撤回／重算月薪，另建獎金發放。

## 重複區塊根因與證據

`HrPayrollPanel` 的兩個同層子元件 `HrPayrollCorrections`、`HrPayrollLegalCases` 都使用 `key={employee+month}`。React 遇到同層重複 key，在非同步讀取及切換員工／月份後留下重複的更正 section。

已在真實 React 畫面、純合成資料下重現兩份「前期已發薪更正」，不是多筆 D1 更正資料。改為帶各自 concern 前綴的穩定 key；切換下月、上月、清空員工及重新選取後，DOM 中更正 heading 恆為 1，法定基準也只保留 1。沒有增加 DOM observer、刪節點、retry 或 CSS 隱藏。

## 修改檔案與 owner

| 檔案 | 修改與原因 |
| --- | --- |
| `migrations/0082_hr_bonus_payments.sql` | 新增批次、員工獎金快照兩表、員工／給付日期索引及統一已給付 view；不修改歷史資料 |
| `shared/hr-bonus.ts` | 預設項目與前後端資料型別 |
| `worker/hr/hr-bonus-service.ts` | 唯一獎金 mutation／validation owner；草稿、發放、作廢、歷史、防重、原子 source guard 與 Audit |
| `worker/http/hr-payroll-routes.ts` | 既有超管薪資入口下的獎金路由；沿用上層身分／啟用帳號限制 |
| `worker/hr/hr-payroll-service.ts` | 新月薪拒絕獎金、舊稿確認提醒；來源改讀統一已給付 view，保留已發薪 snapshot reader |
| `worker/hr/hr-payroll-employer.ts` | 公司清冊同時包含已發放獎金與月薪；來源 ID 加種類，避免兩表同 ID 衝突 |
| `worker/hr/hr-service.ts` | 有獎金紀錄者不能刪員工主檔 |
| `worker/backup/{schema-columns,portable-backup}.ts` | 納入新表、更新 CURRENT_MIGRATION；舊備份缺新表按既有預設還原空表 |
| `src/runtime/modules/HrBonusPanel.tsx` | 單一獎金編輯器及 records owner；共用卡片、欄位、日期、表格、工具列、視窗與未儲存守門；多人批次從員工入口開啟仍展示所有員工 |
| `src/runtime/modules/HrOperationalPage.tsx`、`hr-operational.css` | 卡片順序及兩格寬狀態卡；沒有第二套手機資料流程 |
| `src/ui/records/RelatedCard.tsx` | 加可選 className 供現有卡片設定 grid span，不新增卡片元件 |
| `src/runtime/modules/HrPayrollPanel.tsx` | 加既有共用分頁選項、移除月薪獎金欄位／state／payload；修正同層 key |
| `src/runtime/modules/change-log-labels.ts` | 獎金實體及保存／已發／作廢中文稽核名稱 |
| `scripts/hr-bonus{,-ui}.test.mjs` | SQLite 交易、扣繳累計、防重、source 競態、作廢及備份；表單失敗保留輸入與同一 request key |
| `scripts/hr-payroll{,-ui}.test.mjs` | 月薪／獎金公司彙總整合、ADMIN 禁止讀獎金、月薪 payload 無獎金、同層 key 唯一 |
| `worker/acceptance/hr-payroll-acceptance.ts` | 真正 Worker + D1 驗證改走獨立獎金草稿、冪等、發放及公司彙總 |
| `scripts/validate_schema.py` | 正式表集合新增兩表，保留 schema／backup 精確核對 |
| VERSION、BUILD、package.json、CHANGELOG、TODO、模組契約與 handoff index | 同步版本、現況與審查入口 |

State／render／lifecycle：`BonusRecords` 管清單／視窗、`BonusEditor` 管該份編輯狀態；共用 hooks 管請求失效及離開提示。Mutation：`HrBonusService`；扣繳：既有 `paymentTaxes`；月薪／獎金所得讀取：`hr_paid_income`。沒有新 observer、timer、wrapper chain、外部服務或裝置專用 mutation。

## 資料、稅務與查詢邊界

- 0082 只建兩表、一個 view 及索引；舊資料列回填／改寫為 0。正式資料庫讀取 0、寫入 0。正式部署前應重新預查 `hr_payroll_runs` 筆數及已發薪列數、估算建立部分索引的讀寫量並備份；本輪沒有正式遷移授權。
- 獎金扣繳及個人補充保費重用既有 `paymentTaxes`，未改法定費率或替代官方表；給付日 profile、稅版、期初獎金及已給付累計不足時列待補。
- 同年度已有較晚給付時，補登較早月薪或獎金列待補。若後續給付來源已引用本獎金，不直接作廢改變既有扣繳；必須先核對後續給付。這是維持既有凍結快照的限制，未新增跨期申報更正工具。
- 同員工、給付日期、項目、歸屬年度的非 void 批次禁止重複，檢查在交易內；requestKey 重送內容相同返回原批次，內容不同提示重開確認。發放前與交易內再次比較同一來源快照。
- 每批最多 200 名，source 以一次集合 SELECT 讀取，寫入以集合 INSERT；沒有逐人 API／D1 往返。每人當年最多 500 筆已給付，超限明示；批次序列化限制 1.8MB，避免碰到平台字串上限。列表每次 100 筆、游標續讀，不全表無限展開。
- 平台限制及 batch 交易語意核對官方 [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)／[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。沒有為本次工作改 Cloudflare 配置或方案。

## 驗證紀錄

- `npm run typecheck`／`npm run build`：通過。Vite 原有大 chunk 提醒仍存在。
- `npm run validate:source`：通過，包括表集合／備份欄位、鍵盤與共用欄位檢查。
- 人事／薪資／獎金／Audit 相關 Node：55／55 通過。
- Windows 完整 Node 首輪：993 tests、981 pass、12 fail；其中新動作缺中文名稱已修正並通過相關回歸；其餘屬本機既有 ESM 路徑、canonical checkout／rehearsal 及 LF／CRLF schema fingerprint 限制。完整 Linux CI 結果另補，不將本機失敗說成全套通過。
- `npm run validate:d1:local`：完整 migrations 0001～0082 套用成功，Worker + D1 全部 **20 組** acceptance（含 hrPayroll 獨立獎金）PASS。結尾 Windows Miniflare 的 `metadata.sqlite` 被子程序鎖定，tempfile cleanup 出現 WinError32，npm 指令非成功退出；不隱瞞此限制、不修改正式資料來繞過。
- 真實瀏覽器／合成資料：重現並確認重複 key 修正；月薪來回切月份／員工後更正區塊只有一份。1440px 確認卡片第一排三張，第二排狀態665px／年資326px；獎金表單選取、儲存2000草稿、確認已發放、取消關閉、重開查看、員工獎金卡與完整歷史均正確；金額及「合成發放驗收」備註保留。
- 390px 檢查發放視窗及獎金歷史，document／dialog 沒有水平溢出；共用 table adaptive 呈現。所有日期元件、shared Dialog 與表單 footer 正常，沒有新增背景點擊關閉或 X／取消重複。
- Build 1：已併入 PR546 重新設計後的任用異動（狀態維持 `hr_status_changes`、其餘四欄存 `hr_assignment_changes`，0082 仍接在 0081 後、`CURRENT_MIGRATION` 為 0082）。修正阻擋缺陷：獎金視窗填「歸屬年度」時前端送字串、後端 `integer()` 要求數字而存檔失敗，改送數字（空白仍為 null），並新增 UI 測試驗證 payload 為 number。另補次要項目：已付所得 `paidIncome` 排序與公司清冊加入 `source` 作次序鍵（薪資與獎金 id 相同時結果固定）；0082 移除與 0075 `idx_hr_payroll_runs_paid_date` 功能重複的 `idx_hr_payroll_paid_date`。
- 尚待：Claude 最終審查；正式環境預查／備份及另行授權後遷移部署。

## Claude 審查欄

待審；請特別確認獎金拆分、舊月薪 snapshot 不重複累計、source guard／作廢依賴、整批邊界與卡片排版。執行者不代填通過。
