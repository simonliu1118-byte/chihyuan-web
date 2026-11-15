# CYWEB V0.21.0 Build2 人事第三批每月薪資交接

- 開工日期：2026-11-15；Build2交付更新：2026-11-16（台灣）。狀態：**工程與自動驗證完成，Claude待審，1440／390目視未完成；未合併／未部署**。
- [Draft PR #518](https://github.com/simonliu1118-byte/chihyuan-web/pull/518)，分支`cyweb/hr-payroll-rules-20261115`；base仍第二批`cyweb/hr-table-ui-20261115`／PR #517，父HEAD `1d6e9974dff1181b5b2735fc0de15af79dd69d2f`。不回寫父分支，不改base到main。
- 本輪承接Build1 HEAD `53d46dbe7743a6b64f76706431b923148d014714`，使用者「繼續」授權；原規劃HEAD `6049034c82a9ae6d470b5ea5ec1b16e193c9d143`亦保留在分支歷史。同工作項目BUILD 1升2、VERSION／package仍0.21.0，不另升版本。
- 使用者要求所有改動寫handoff交Claude、共用元件與表格式、不得自行合併／部署。本輪**正式D1讀寫0、遠端migration0、部署0、合併0、正式帳號授權變更0**；沒有AI接口、自動匯款或政府申報。
- 唯一計算／接口契約：[HR_PAYROLL_CONTRACT](../architecture/HR_PAYROLL_CONTRACT.md)；公司已定規則不重問，來源／主檔不另複製。

## 本輪交付與計算邊界

1. 保留Build1每月清冊、主檔生效工資／津貼、30天、逐人全勤、單次1～5分鐘免扣與6分鐘扣全部、早退、普通病假比例與法定保護；原補休／特休結清防重、具名ADMIN限門市更正下班卡及已發薪不可改快照均保留。
2. 保費／勞退依profile及法定表生效日分段，月底健保取當日事實，勞就保日額精度及月底分項舍入；月中全勤／約定工時變更仍需另核對，不冒稱所有工資設定已完整分段。
3. 產假正式假單包含完整連續56／28／7／5曆日，跨月跨年也驗完整；核對最近月工資與較高六個月平均日工資，未滿六個月半薪、短期流產無薪和全勤保護分開。公傷病核對原領日工資、醫療期間及每月同事故抵充（無也須明確0），時薪依實際例假排班，缺資料待補。法定補償和一般課稅薪資分開。
4. 本次另發獎金與月薪**同一給付日**；本職月薪按給付月累計、非每月獎金／兼職依單次門檻、非居住者同月總額6／18。個人補充保費用給付日身分、獎金年累計／外部期初、投保金額倍數及單次上限；不拆同日付款繞過門檻，不從外部截止日漏掉系統內獎金。
5. 公司補充保費獨立給付月／單位清冊，只讀系統已發薪所得快照與月底投保設定，不扣員工。外部支付不在清冊，不能把這份計算當政府申報完成；它是可重新核對的彙總，非已提交申報的凍結快照。
6. 前期已發薪錯誤以後月差額處理；原快照保留。追回工資須員工同意，保費／稅退還須依據且不超原已扣上限；requestKey冪等、來源／目標月狀態／累計上限交易再驗。確認時唯一保留差額、撤回未發薪釋放；已套用不能直接撤。工資補發入當期課稅，其他稅後更正不倒扣當期所得；政府申報仍另依程序辦。
7. 新增四表以0074～0076 forward migrations，全部納入現有備份／空庫還原。新增API仍只供SUPER_ADMIN，指定ADMIN更正範圍不擴大。所有新增核對／差額／官方版本留Audit；profile有生效歷史與舊編輯鎖。
8. 新畫面與既有薪資頁同頁，EntryFields columns／Dialog／cy-op-table／cy-rt／DataViewToolbar及820px共用規則，不加另一套CSS／表單／計算核心。

## 逐檔修改（完整PR相對第二批base）

| 檔案 | 原因／行為 |
| --- | --- |
| [BUILD](../../BUILD) | 同一第三批工作項目續作，1升2；VERSION仍0.21.0，不另升版本。 |
| [CHANGELOG.md](../../CHANGELOG.md) | 新增Build2實作、測試、未目視與法定邊界；舊Build1保留為歷史。 |
| [TODO.md](../../TODO.md) | 更新第三批目前已實作與待Claude／目視／特殊情境，未勾成已部署。 |
| [VERSION](../../VERSION) | 每月薪資為完整新功能階段，Minor升0.21.0、Build維持0。 |
| [docs/architecture/API_CONTRACT.md](../../docs/architecture/API_CONTRACT.md) | 總API合約補薪資、設定及窄更正權限。 |
| [docs/architecture/CANONICAL_DATA_MODEL.md](../../docs/architecture/CANONICAL_DATA_MODEL.md) | 記錄0073七表、關係與備份語意。 |
| [docs/architecture/HR_MODULE_CONTRACT.md](../../docs/architecture/HR_MODULE_CONTRACT.md) | 總人事合約標窄ADMIN例外及第三批契約入口。 |
| [docs/architecture/HR_MODULE_DESIGN.md](../../docs/architecture/HR_MODULE_DESIGN.md) | 第三批入口及共用表格設計連到正式契約；Build2同頁三個明細表。 |
| [docs/architecture/HR_PAYROLL_CONTRACT.md](../../docs/architecture/HR_PAYROLL_CONTRACT.md) | 唯一薪資契約補新API／月中投保／產假公傷／補充保費／後月差額及真實限制。 |
| [docs/architecture/README.md](../../docs/architecture/README.md) | 架構索引加入每月薪資契約。 |
| [docs/development/HR_PAYROLL_PLAN.md](../../docs/development/HR_PAYROLL_PLAN.md) | 保留規劃與需求確認歷史，新增Build2進度對照；不再詢問已定公司規則。 |
| [docs/handoff/CYWEB-HR-PAYROLL-20261115.md](../../docs/handoff/CYWEB-HR-PAYROLL-20261115.md) | 本交接：所有PR差異逐檔、實證、範圍／限制、Claude待審，不代審查。 |
| [docs/handoff/CYWEB-HR-PAYROLL-RULES-20261115.md](../../docs/handoff/CYWEB-HR-PAYROLL-RULES-20261115.md) | 保存使用者規則與法源確認；原規劃轉接工程契約與handoff，非另一套計算。 |
| [docs/handoff/README.md](../../docs/handoff/README.md) | 現行交接入口與舊規劃承接狀態。 |
| [migrations/0073_hr_payroll.sql](../../migrations/0073_hr_payroll.sql) | 七表、索引／狀態／唯一消耗與假單保護欄，僅forward migration，未遠端套用。 |
| [migrations/0074_hr_payroll_legal_cases.sql](../../migrations/0074_hr_payroll_legal_cases.sql) | 新增追加式法定案件事實版本、期間／金額／同事故月抵充與證明，不複製薪資主檔。 |
| [migrations/0075_hr_payroll_supplement.sql](../../migrations/0075_hr_payroll_supplement.sql) | 官方補充保費版本與生效索引、薪資給付日期索引。 |
| [migrations/0076_hr_payroll_corrections.sql](../../migrations/0076_hr_payroll_corrections.sql) | 追加前期差額與唯一套用關係、requestKey／revision／來源FK及查詢索引。 |
| [package.json](../../package.json) | 套件版本與VERSION同步。 |
| [scripts/hr-payroll-ui.test.mjs](../../scripts/hr-payroll-ui.test.mjs) | 6項互動：原profile／計算／出勤更正，加法定案件初讀失敗／寫失敗留值、差額同意及冪等重試；guard替身不冒稱瀏覽器。 |
| [scripts/hr-payroll.test.mjs](../../scripts/hr-payroll.test.mjs) | 32項核心／SQLite／HTTP：既有30天全勤與新增連續產假、公傷、月中保費、年累計／上限、公司費用及差額防重；新API拒非超管。 |
| [scripts/item-price-record-sheet.test.mjs](../../scripts/item-price-record-sheet.test.mjs) | 原硬寫0072的備份標記改讀migration chain最新值，保留一致性檢查，避免新增合法migration誤報。 |
| [scripts/test-support/hr-payroll-sources.mjs](../../scripts/test-support/hr-payroll-sources.mjs) | 明示合成官方形狀來源fixture，增加補充保費公式；測冪等、版本／Audit與異常隔離。 |
| [scripts/validate_d1_local.py](../../scripts/validate_d1_local.py) | 必驗hrPayroll旗標，不能只遷移成功就算薪資驗收。 |
| [scripts/validate_schema.py](../../scripts/validate_schema.py) | 77個migration／169表與完整欄位、備份一致性；新四表契約。 |
| [shared/cyweb-cron.ts](../../shared/cyweb-cron.ts) | 原唯一cron於台灣04:00新增payrollRules每日分派，其他任務時段不變。 |
| [shared/hr-leave.ts](../../shared/hr-leave.ts) | 按前綴分鐘處理生理假年度前三日，拆單／同日不重複合併病假。 |
| [shared/hr-payroll-insurance.ts](../../shared/hr-payroll-insurance.ts) | 抽離同一共用核心的月中投保／勞退分段與月底健保，分項精度／30天與31日邊界。 |
| [shared/hr-payroll-legal.ts](../../shared/hr-payroll-legal.ts) | 產假連續全曆日／年資半薪／短期流產及全勤保護；公傷原領工資、例假及同事故抵充；缺來源待補。 |
| [shared/hr-payroll-supplement.ts](../../shared/hr-payroll-supplement.ts) | 給付月／單次本職兼職扣繳、非每月獎金、獎金年累計與補充保費；外部期初和同日門檻／上限，不重複扣。 |
| [shared/hr-payroll.ts](../../shared/hr-payroll.ts) | 唯一Worker核心編排：原月薪／假勤／加班／結清，串保費分段、法定曆日、給付稅務及後月差額；UI只import types。 |
| [src/App.tsx](../../src/App.tsx) | ADMIN讀更正capabilities後才有窄入口；不掛薪資或人事設定，後端仍重驗。 |
| [src/runtime/modules/HrAttendanceCorrections.tsx](../../src/runtime/modules/HrAttendanceCorrections.tsx) | 指定門市／月份出勤表、更正Dialog及原值／原因；失敗留輸入、防連點與過期回應。 |
| [src/runtime/modules/HrEmployerSupplement.tsx](../../src/runtime/modules/HrEmployerSupplement.tsx) | 按給付月／單位列公司補充保費，展開已發薪／投保來源，搜尋員工明細；公司負擔不扣員工，標明非申報完成。 |
| [src/runtime/modules/HrLeaveDialog.tsx](../../src/runtime/modules/HrLeaveDialog.tsx) | 新假單法定保護欄；產假自動整日、不能以半小時表單拆法定連續假。 |
| [src/runtime/modules/HrLeavePanel.tsx](../../src/runtime/modules/HrLeavePanel.tsx) | 有效舊假單可核對／更正全勤保護，顯示保護標示，共用表格Dialog、失敗留輸入。 |
| [src/runtime/modules/HrLeaveTypeSettings.tsx](../../src/runtime/modules/HrLeaveTypeSettings.tsx) | 自建假在同列表設給薪比例；法定假欄唯讀。 |
| [src/runtime/modules/HrOperationalPage.tsx](../../src/runtime/modules/HrOperationalPage.tsx) | 原薪資tab使用設定／每月薪資wrapper，五個主頁籤不另增模組。 |
| [src/runtime/modules/HrPayrollCorrections.tsx](../../src/runtime/modules/HrPayrollCorrections.tsx) | 原已發薪來源、後月差額、追回同意／證明與撤銷表；穩定requestKey重試、失敗留值、已套用禁撤。 |
| [src/runtime/modules/HrPayrollLegalCases.tsx](../../src/runtime/modules/HrPayrollLegalCases.tsx) | 同頁法定案件表＋EntryFields columns／Dialog；追加版本、核對來源，讀失敗禁存／寫失敗留值與防連點。 |
| [src/runtime/modules/HrPayrollPanel.tsx](../../src/runtime/modules/HrPayrollPanel.tsx) | 每月清冊／明細與profile補所得性質、補充保費身分／證明、投保單位及外部獎金期初；同日另發獎金輸入，接三個共用表格。 |
| [src/runtime/modules/HrPayrollSettings.tsx](../../src/runtime/modules/HrPayrollSettings.tsx) | 官方表與指定更正共用設定表；新增補充保費版本標籤及kind+id鍵，讀失敗禁覆寫。 |
| [src/runtime/modules/HrSettingsButton.tsx](../../src/runtime/modules/HrSettingsButton.tsx) | 既有設定Dialog內接官方表與指定更正，沿既有超管入口。 |
| [src/runtime/modules/change-log-labels.ts](../../src/runtime/modules/change-log-labels.ts) | 補齊全部薪資／更正／表版／保護Audit的正體中文標籤。 |
| [worker/acceptance/d1-local-acceptance.ts](../../worker/acceptance/d1-local-acceptance.ts) | 接入上述薪資真D1驗收、回報hrPayroll。 |
| [worker/acceptance/hr-payroll-acceptance.ts](../../worker/acceptance/hr-payroll-acceptance.ts) | 真Worker＋D1：原草稿／確認／已發薪不變，續測案件來源失效、同日獎金／差額、唯一保留／撤回再套及公司補充保費170000→3587。 |
| [worker/backup/portable-backup.ts](../../worker/backup/portable-backup.ts) | CURRENT_MIGRATION同步0076；沿同一備份／空庫還原流程，不改還原owner。 |
| [worker/backup/schema-columns.ts](../../worker/backup/schema-columns.ts) | 0073七表及假單欄、Build2四表均納入可攜備份；舊備份缺表為空。 |
| [worker/hr/hr-attendance-correction.ts](../../worker/hr/hr-attendance-correction.ts) | 指定ADMIN限門市下班卡；讀寫同查詢／交易驗授權、revision、實際時間順序與Audit。 |
| [worker/hr/hr-leave-service.ts](../../worker/hr/hr-leave-service.ts) | 結構化保護與假單同交易；產假必須完整連續法定56／28／7／5日，部分工時產假以曆日額度驗證。 |
| [worker/hr/hr-payroll-corrections.ts](../../worker/hr/hr-payroll-corrections.ts) | 已發薪後月差額追加／可撤銷，員工同意、原扣額累計上限、已確認目標拒插入，冪等與交易內再驗。 |
| [worker/hr/hr-payroll-employer.ts](../../worker/hr/hr-payroll-employer.ts) | 有界批量查已發薪所得、月底投保profile及官方補充保費，按單位彙總公司費用；缺事實不補0冒稱完成。 |
| [worker/hr/hr-payroll-import.ts](../../worker/hr/hr-payroll-import.ts) | 原四種官方級距＋最低工資，自動健保任務加入補充保費白名單／原文／生效／hash及Audit，同批版本保留與異常隔離。 |
| [worker/hr/hr-payroll-legal-service.ts](../../worker/hr/hr-payroll-legal-service.ts) | 追加案件事實、驗期間／日平均精度／來源／月抵充；expectedId與Audit同交易，不覆寫舊版。 |
| [worker/hr/hr-payroll-service.ts](../../worker/hr/hr-payroll-service.ts) | 有界同一SQL來源：完整profile、案件版本、補充保費、給付年已發薪及差額；confirm/pay原子來源guard、差額唯一保留／撤回釋放。 |
| [worker/http/hr-payroll-routes.ts](../../worker/http/hr-payroll-routes.ts) | 原超管薪資／設定路由，新增legal-cases、corrections及employer-supplement，沿原錯誤／Audit；無AI接口。 |
| [worker/http/hr-phase2b-routes.ts](../../worker/http/hr-phase2b-routes.ts) | 自建假給薪比例驗證0～1；法定假比例不開放修改。 |
| [worker/http/hr-routes.ts](../../worker/http/hr-routes.ts) | 啟用CYID帳號後只對兩條更正路徑放窄例外，原人事／薪資仍SUPER_ADMIN。 |
| [worker/index.ts](../../worker/index.ts) | 同一scheduled並行任務集合呼叫官方表Service；失敗保留既有錯誤處理。 |

## 本輪驗證證據

| 驗證 | Build2結果／限制 |
| --- | --- |
| `node --test scripts/*.test.mjs` | **901／901，0失敗、0跳過**，完整父批回歸；約33秒 |
| `node --test scripts/hr-payroll*.test.mjs` | **38／38**：32核心／SQLite／HTTP＋6Host互動；不是目視 |
| `npm run build` | 前後端TypeScript與Vite通過；只有既有大chunk提示 |
| `npm run validate:source` | 通過；77個migration檔（含兩個0031）、169表，備份欄位／權限／Audit／共用表單契約同步 |
| `npm run validate:d1:local` | **實際Wrangler＋Worker＋全新本地D1通過**；完整77 migrations、hrPayroll新差額保留／釋放／重套、法定案件來源guard、公司費用、原不可改快照，及原備份／復原／交易等驗收 |
| `npm run validate:deploy` | 部署設定契約PASS；只是檢查，沒有觸發部署 |
| 公開官方來源完整匯入 | 同一importer實際取得**13個官方URL**，勞就保28級、勞退62級、健保58級、扣繳840列，生效2026-01-01；最低工資2025／2026／已發布2027，健保補充保費頁有效規則2.11%／4倍／1000萬及2021-01-01生效，隔離SQLite，非正式Worker定時成功 |
| 格式／政策／版本 | 合成官方形狀transport測冪等、原文／hash、五筆版本Audit、不完整表隔離及扣繳費率語意異常阻擋；不把合成當實際政府回應 |
| UI／失敗保護 | 實際元件Host測初讀失敗禁存、重讀、寫失敗留值、防連點、待補禁確認與差額穩定requestKey；原完整導航guard另有既有測試 |
| 1440／390目視 | **未完成**。本輪Chromium可開，但Sky控制回`AT-SPI provider ... unavailable`；雲端瀏覽器拒`file:` URL政策。停止該路徑，未繞過、未偽造截圖或把Host當目視；合成預覽只在忽略的臨時目錄 |
| `git diff --check`／相對連結／逐檔覆蓋 | 提交前通過；遠端tree須與本機index相同，最終CI看下方PR入口 |

測試使用合成員工／薪資及公開政府資料，沒有真員工資料。環境loopback shim僅供Wrangler本機測試，不提交／不改正式workflow；本輪D1在來源凍結後一次完整成功。Build1曾在驗收中修改來源而HMR重送fixture，已記錄為歷史環境問題，本輪不重用該舊資料。

## 官方法源與Claude複核口徑

- 勞保：[6259分擔表](https://data.gov.tw/dataset/6259)、[6258級距](https://data.gov.tw/dataset/6258)、[30天及分項舍入](https://www.bli.gov.tw/0014162.html)；勞退[6274](https://data.gov.tw/dataset/6274)，健保[20246](https://data.gov.tw/dataset/20246)及[月底計收](https://www.nhi.gov.tw/ch/cp-3204-6ecca-2568-1.html)。
- 最低工資：[歷年已發布公告](https://www.mol.gov.tw/1607/28162/28166/28180/99861/28184/29016/)。扣繳[25627](https://data.gov.tw/dataset/25627)及[財政部1505](https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/withheld-rule/rule/NM11BZY)；下載Accept用`*/*`且驗CSV，HTML不當成功。
- 產假：[勞動部給薪／平均工資](https://www.mol.gov.tw/1607/28690/2282/2284/2294/7269/)、[短期流產可選假別](https://www.mol.gov.tw/1607/28690/2282/2284/2320/7373/)、[施行細則連續曆日](https://laws.mol.gov.tw/flaw/FLAWDOC01.aspx?flno=6&id=FL015150)。本輪明確處理未滿六月、5／7日流產、完整期間及2月全月給薪底線，不把普通半小時規則套在法定連續產假。
- 公傷病：[勞基法59條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=59&id=FL014930)、[原領工資及時薪例假](https://www.mol.gov.tw/1607/28162/28166/82050/82053/82055/?cprint=pt)、[同事故抵充](https://www.mol.gov.tw/1607/28690/2282/2340/2346/7432/)、[財政部職災醫療中原領工資補償免稅](https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=7d3fcc7df73844fdb55ee7487b23da96)。不把一般補助自動當法定免稅補償。
- 補充保費：[現行公式／生效](https://www.nhi.gov.tw/ch/cp-4516-74b0f-2613-1.html)、[114作業手冊](https://www.nhi.gov.tw/ch/dl-64814-5f26c2b955c24ebbbbf1479877ecfb7e-1.pdf)、[公司薪資所得定義](https://www.nhi.gov.tw/ch/cp-3056-aba1c-3150-1.html)、[勞退自提與合法免稅項不納公司補充所得](https://www.nhi.gov.tw/ch/cp-2825-ccb07-3150-1.html)。
- 病假／全勤：[勞動部115年Q7／Q10](https://www.mol.gov.tw/1607/28162/28166/28180/86983/87103/)、[請假規則](https://laws.mol.gov.tw/flaw/FLAWDAT0202.aspx?id=FL014935&ldate=20251209)、[性平21條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=21&id=FL015149)、[生理假14條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=14&id=FL015149)。
- 加班／結清：[勞動部加班費](https://www.mol.gov.tw/1607/28162/28166/28180/81521/81707/)、[補休原日工資與先後](https://www.mol.gov.tw/1607/28162/28166/28180/28198/28202/47031/)、[財政部1125免稅](https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/taxation-scope/which-income/7jOz7Dr)。

## 尚待審查、資料與功能邊界

1. **不把901項通過當成所有法定情境驗收。** Claude優先複核普通病假／全勤基礎、產假全月28／31日與平均日工資、短期流產假別選擇、公傷醫療期間／原工資／同事故抵充、月中保費四位日額與月底分項舍入，以及課稅／補充保費基礎。
2. 不同日期另發獎金批、外派／特殊投保身分、跨投保單位轉換之年累計、54／138協議工時、普通病假另有保險給付差額等特殊案件未提供完整專用流程。缺實際事實不猜；必須先按適用制度複核，不能宣稱全面自動合法。
3. 年內系統外獎金、原日工資／六個月平均、同事故給付、稅務免扣身分、已申報投保額均須來源。系統外發薪不在公司費用清冊，沒有政府補申報／繳費功能。正式採用前須確認資料涵蓋範圍。
4. 已發薪不可改／刪、差額只能後月；退額是有依據的實際差額，並非系統自動向國稅局／健保署申請退款。工資追回同意、原額上限、同idempotency payload、目標月並行確認與唯一保留須Claude審交易。
5. 所有新薪資路徑仍SA，ADMIN只限原兩條門市下班更正；停用帳號、USER、跨店及撤回授權競態保持拒絕。原Audit隱私、來源guard／有界查詢／備份缺新表為空須複核。
6. 官方完整公開資料已實讀，但正式Cloudflare排程尚未執行；來源改版可能需修adapter，錯誤須顯示與阻擋。沒有新增其他BOT通知。法定表舊版／已發薪版本留存，不反向覆蓋。
7. **1440／390真目視待補**，共用表格長欄、Dialog鍵盤／離開確認及手機可讀性由Claude後續驗。未新增正式薪資單列印／匯出模板。

## 提交與CI追溯

- Build1工程`d274ada444d1edf1a817287928398faa25302db5`、文件補證據`8a376f3`、最後防少算`53d46dbe7743a6b64f76706431b923148d014714`，Runtime依序[43714183868](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/43714183868)、[43714466967](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/43714466967)、[43715191271](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/43715191271)，均success；不是Build2最終CI。
- Build2將所有續作程式、測試、migrations、契約、版本與本交接同一提交；提交前核對本機index與遠端tree完全一致。實際Build2提交SHA／Runtime結果記於[PR #518最新檢查與描述](https://github.com/simonliu1118-byte/chihyuan-web/pull/518)，避免只為填本文件自指SHA產生額外工程提交。
- 所有PR差異以上逐檔表為準；父分支及main無寫入。PR保留draft供Claude，審查通過也不得自動合併／部署或遠端套migration。

## Claude審查欄（僅審查者填）

- 審查者／日期：待Claude。
- 結論：**待審，執行者未代填通過**。
- 需修正：待填；建議先法定公式／適用邊界，再交易／權限及UI目視。
- 合併、部署及遠端migration：使用者明確禁止，沒有新的授權。
