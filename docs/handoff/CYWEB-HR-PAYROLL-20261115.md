# CYWEB V0.21.0 Build1 人事第三批每月薪資交接

- 日期：2026-11-15（台灣需求紀錄；本輪驗證UTC2026-11-15晚間）。狀態：工程已備妥供Claude審查，尚未全情境／目視驗收，**未合併／未部署**。
- PR：[518](https://github.com/simonliu1118-byte/chihyuan-web/pull/518)；分支`cyweb/hr-payroll-rules-20261115`，base第二批`cyweb/hr-table-ui-20261115`，父HEAD `1d6e9974dff1181b5b2735fc0de15af79dd69d2f`。不回寫父分支，不改base到main。原規劃HEAD `6049034c82a9ae6d470b5ea5ec1b16e193c9d143`後承接本工程。
- 使用者明確授權開工及繼續，要求共用元件／表格式、每次handoff交Claude、不得自行合併及部署；本輪正式D1讀寫0、遠端migration0、部署0、AI接口0。
- 新能力包含月薪計算、法定表年度自動更新、快照與窄更正，屬完整功能階段，Minor升V0.21.0／初始BUILD 0；最後防少算修正為同工作項目BUILD 1，沒有另升版本或Major。
- 規格唯一入口：[HR_PAYROLL_CONTRACT](../architecture/HR_PAYROLL_CONTRACT.md)。此交接不另建平行公式；已定公司規則不重問。

## 交付行為

1. 原薪資tab保留設定，再加每月清冊與明細。只讀商品以外的人事薪資主檔、津貼、有效假單及共用出勤核心；全勤逐人勾選，30天／單次5與6分鐘／早退／病假比例／法定保護分開。前端無薪資公式或第二套薪資主檔。
2. 草稿→確認→人工標記已發薪，確認可撤回為void歷史再開新稿，已發薪不可撤回。確認與標記均在同一transaction再比對完整有界來源SQL，Revision及Audit同批；不會把新出勤或新官方表靜默套入已發薪結果。
3. 官方表沿唯一cron台灣04:00自動檢查，來源驗證後自動導入，不需每年手動批准。下載網址從官方資料集探索，HTML／不完整級距／年度／費率語意變更均不當成功；暫時網路錯誤仍只能使用尚有效原版。版本／原文／來源文字SHA／正規化hash／parserVersion／Audit與可攜備份保留，最低工資含已發布未來生效公告。
4. 具名ADMIN按門市只能更正既有下班時間，登入角色及有效帳號／授權缺一不可；USER無能力，薪資、人事主檔、上班卡與加班不開放。原值、新值、原因、revision與Audit留存，並行撤回授權使整筆更正回滾。
5. 補休用原已發薪工資率及免稅級距，特休用原年度終結／離職基準，確認時唯一消耗，撤回未發薪才釋放。缺歷史快照先待補，不猜現在工資、不重付。既有特休遞延制度不改。
6. 新舊假單可設定法定全勤保護；公司假給薪比例可自建，法定假不得用一般設定覆寫。生理假拆單年度前三日併病假的前綴邊界修正。

## 逐檔修改

| 檔案 | 原因／行為 |
| --- | --- |
| [BUILD](../../BUILD) | 同工作項目收尾修正計薪天數矛盾，Build由0升1，未部署。 |
| [CHANGELOG.md](../../CHANGELOG.md) | 記錄第三批行為、驗證及未涵蓋情境，不宣稱已部署。 |
| [TODO.md](../../TODO.md) | 區分已實作與Claude／目視／特殊法定待補，保留父批未合併狀態。 |
| [VERSION](../../VERSION) | 每月薪資為完整新功能階段，Minor升0.21.0、Build維持0。 |
| [docs/architecture/API_CONTRACT.md](../../docs/architecture/API_CONTRACT.md) | 總API合約補薪資、設定及窄更正權限。 |
| [docs/architecture/CANONICAL_DATA_MODEL.md](../../docs/architecture/CANONICAL_DATA_MODEL.md) | 記錄0073七表、關係與備份語意。 |
| [docs/architecture/HR_MODULE_CONTRACT.md](../../docs/architecture/HR_MODULE_CONTRACT.md) | 總人事合約標窄ADMIN例外及第三批契約入口。 |
| [docs/architecture/HR_MODULE_DESIGN.md](../../docs/architecture/HR_MODULE_DESIGN.md) | 更新第三期規劃標記，連到本批契約及待審狀態。 |
| [docs/architecture/HR_PAYROLL_CONTRACT.md](../../docs/architecture/HR_PAYROLL_CONTRACT.md) | 本批正式分支資料／API／權限／公式／來源／狀態／限制契約，不用handoff當第二套業務規則。 |
| [docs/architecture/README.md](../../docs/architecture/README.md) | 架構索引加入每月薪資契約。 |
| [docs/development/HR_PAYROLL_PLAN.md](../../docs/development/HR_PAYROLL_PLAN.md) | 保留原需求／研究快照，新增目前實作對照，避免舊尚未實作文字誤導。 |
| [docs/handoff/CYWEB-HR-PAYROLL-20261115.md](../../docs/handoff/CYWEB-HR-PAYROLL-20261115.md) | 本交接，逐檔、證據、風險與Claude待審欄，執行者不代填通過。 |
| [docs/handoff/CYWEB-HR-PAYROLL-RULES-20261115.md](../../docs/handoff/CYWEB-HR-PAYROLL-RULES-20261115.md) | 規劃handoff增工程承接連結，不抹掉先前文件提交歷史。 |
| [docs/handoff/README.md](../../docs/handoff/README.md) | 現行交接入口與舊規劃承接狀態。 |
| [migrations/0073_hr_payroll.sql](../../migrations/0073_hr_payroll.sql) | 七表、索引／狀態／唯一消耗與假單保護欄，僅forward migration，未遠端套用。 |
| [package.json](../../package.json) | 套件版本與VERSION同步。 |
| [scripts/hr-payroll-ui.test.mjs](../../scripts/hr-payroll-ui.test.mjs) | 4項Host互動測試：初讀失敗、儲存留值、防連點、待補禁確認、指定更正失敗；不是瀏覽器目視。 |
| [scripts/hr-payroll.test.mjs](../../scripts/hr-payroll.test.mjs) | 24項核心／官方來源／實際SQLite／權限／競態／結清／留停測試，含MOL可手核例、原文佐證與政策變更隔離。 |
| [scripts/item-price-record-sheet.test.mjs](../../scripts/item-price-record-sheet.test.mjs) | 原硬寫0072的備份標記改讀migration chain最新值，保留一致性檢查，避免新增合法migration誤報。 |
| [scripts/test-support/hr-payroll-sources.mjs](../../scripts/test-support/hr-payroll-sources.mjs) | 明示合成的官方形狀transport fixture，測自動探索、SVG、歷年／未來日期、格式／政策異常，不冒稱真官方表。 |
| [scripts/validate_d1_local.py](../../scripts/validate_d1_local.py) | 必驗hrPayroll旗標，不能只遷移成功就算薪資驗收。 |
| [scripts/validate_schema.py](../../scripts/validate_schema.py) | 預期schema七表、欄位及備份一致性gate。 |
| [shared/cyweb-cron.ts](../../shared/cyweb-cron.ts) | 原唯一cron於台灣04:00新增payrollRules每日分派，其他任務時段不變。 |
| [shared/hr-leave.ts](../../shared/hr-leave.ts) | 按前綴分鐘處理生理假年度前三日，拆單／同日不重複合併病假。 |
| [shared/hr-payroll.ts](../../shared/hr-payroll.ts) | 薪資唯一核心、30天／生效工資、全勤／扣款、假別、加班／稅、保費／勞退、結清與明細型別。 |
| [src/App.tsx](../../src/App.tsx) | ADMIN讀更正capabilities後才有窄入口；不掛薪資或人事設定，後端仍重驗。 |
| [src/runtime/modules/HrAttendanceCorrections.tsx](../../src/runtime/modules/HrAttendanceCorrections.tsx) | 指定門市／月份出勤表、更正Dialog及原值／原因；失敗留輸入、防連點與過期回應。 |
| [src/runtime/modules/HrLeaveDialog.tsx](../../src/runtime/modules/HrLeaveDialog.tsx) | 新假單按假別提供法定全勤保護事由，不從自由文字猜。 |
| [src/runtime/modules/HrLeavePanel.tsx](../../src/runtime/modules/HrLeavePanel.tsx) | 有效舊假單可核對／更正全勤保護，顯示保護標示，共用表格Dialog、失敗留輸入。 |
| [src/runtime/modules/HrLeaveTypeSettings.tsx](../../src/runtime/modules/HrLeaveTypeSettings.tsx) | 自建假在同列表設給薪比例；法定假欄唯讀。 |
| [src/runtime/modules/HrOperationalPage.tsx](../../src/runtime/modules/HrOperationalPage.tsx) | 原薪資tab使用設定／每月薪資wrapper，五個主頁籤不另增模組。 |
| [src/runtime/modules/HrPayrollPanel.tsx](../../src/runtime/modules/HrPayrollPanel.tsx) | 保留薪資設定，新增月份清冊／明細、待補、歷史、全勤勾選／投保profile、實際發薪日、來源版本與確認流程；共用表格式／guard。 |
| [src/runtime/modules/HrPayrollSettings.tsx](../../src/runtime/modules/HrPayrollSettings.tsx) | 法定表同步狀態／歷史、立即再查、具名門市授權；初讀失敗不能用空授權資料覆寫。 |
| [src/runtime/modules/HrSettingsButton.tsx](../../src/runtime/modules/HrSettingsButton.tsx) | 既有設定Dialog內接官方表與指定更正，沿既有超管入口。 |
| [src/runtime/modules/change-log-labels.ts](../../src/runtime/modules/change-log-labels.ts) | 補齊全部薪資／更正／表版／保護Audit的正體中文標籤。 |
| [worker/acceptance/d1-local-acceptance.ts](../../worker/acceptance/d1-local-acceptance.ts) | 接入上述薪資真D1驗收、回報hrPayroll。 |
| [worker/acceptance/hr-payroll-acceptance.ts](../../worker/acceptance/hr-payroll-acceptance.ts) | 實際本地Worker＋D1驗證JSON來源SQL、舊草稿阻擋、確認／已發薪及不可改快照。 |
| [worker/backup/portable-backup.ts](../../worker/backup/portable-backup.ts) | CURRENT_MIGRATION同步0073，沿原備份／空庫復原架構。 |
| [worker/backup/schema-columns.ts](../../worker/backup/schema-columns.ts) | 新增七表及假單欄位納入可攜備份，與完整migration chain欄位集合對照。 |
| [worker/hr/hr-attendance-correction.ts](../../worker/hr/hr-attendance-correction.ts) | 指定ADMIN限門市下班卡；讀寫同查詢／交易驗授權、revision、實際時間順序與Audit。 |
| [worker/hr/hr-leave-service.ts](../../worker/hr/hr-leave-service.ts) | 新假單驗證／保存結構化全勤保護，與假單／排班／Audit同交易。 |
| [worker/hr/hr-payroll-import.ts](../../worker/hr/hr-payroll-import.ts) | 白名單、轉址／串流／逾時、四種解析／有效日期、政策變動阻擋、來源原文／佐證／parserVersion、hash、租約、冪等與最低工資追加。 |
| [worker/hr/hr-payroll-service.ts](../../worker/hr/hr-payroll-service.ts) | 有界同一SQL來源快照、計算編排、profile歷史、結清／防重、草稿與狀態交易、逐日確認與Audit。 |
| [worker/http/hr-payroll-routes.ts](../../worker/http/hr-payroll-routes.ts) | 超管薪資與設定路由、版本衝突envelope、假單保護更正交易、窄更正路由。 |
| [worker/http/hr-phase2b-routes.ts](../../worker/http/hr-phase2b-routes.ts) | 自建假給薪比例驗證0～1；法定假比例不開放修改。 |
| [worker/http/hr-routes.ts](../../worker/http/hr-routes.ts) | 啟用CYID帳號後只對兩條更正路徑放窄例外，原人事／薪資仍SUPER_ADMIN。 |
| [worker/index.ts](../../worker/index.ts) | 同一scheduled並行任務集合呼叫官方表Service；失敗保留既有錯誤處理。 |

## 本輪驗證證據

| 驗證 | 結果／範圍 |
| --- | --- |
| `node --test scripts/*.test.mjs` | **891／891通過，0失敗、0跳過**；含父批回歸，Build1防少算收尾後完整重跑約48秒，最終HEAD由PR Runtime再次驗證 |
| `node --test scripts/hr-payroll*.test.mjs` | **28／28通過**，24核心／SQLite／HTTP＋4介面互動；含新來源原文context與費率變更隔離 |
| `npm run typecheck`／`npm run build` | 前後端TypeScript與Vite通過；build僅既有大chunk提示 |
| `npm run validate:source` | 通過，74個migration檔（含兩個0031），165表；新表／backup columns一致；form／Audit／權限契約未放寬 |
| `npm run validate:d1:local` | **實際Wrangler＋Worker＋本地D1通過**，新增`hrPayroll`真流程，亦驗證備份／復原等原有驗收；不是只有SQLite mock |
| `npm run validate:deploy` | 部署設定契約通過；只有檢查，未觸發部署 |
| 公開官方來源完整導入 | 實際同一importer從官方12個URL取得資料，在一次性隔離SQLite匯入勞／就保28級、勞退62級、健保58級、扣繳840列，生效2026-01-01；最低工資2025／2026／2027正確追加 |
| 完整來源冪等／異常 | 合成官方形狀transport驗證未改表不增版本／Audit，格式錯誤及5%政策變更阻擋；合成測試不冒稱正式Worker定時成功 |
| 桌機1440／手機390目視 | **未完成**；Chromium launch失敗：`process_singleton_posix.cc ... socket() failed: Operation not permitted (1)`；沒有偽造截圖或把Host當目視 |
| `git diff --check`及相對連結 | 通過；PR遠端tree／CI證據見下節 |

驗證使用合成員工、公開政府表；沒有真員工、薪資憑證、遠端D1或正式寫入。臨時loopback shim只協助此環境`os.networkInterfaces()`，不提交、不改workflow；實際D1正常跑完。一次驗收中途修改被Wrangler監看的來源導致熱重載，回`UNIQUE app_members.id`；停止修改並用**全新暫存D1**重跑後全過，沒有把有寫入的舊fixture當readiness再重試。首次缺Dialog size及測試fixture錯欄位已修正，最終TypeScript／目標測試均通過。

## PR遠端CI與來源核對

- 工程提交：`d274ada444d1edf1a817287928398faa25302db5`；GitHub tree `17a63c740466167f8a22ccb81a04158d35afc2dd`與本機index一致，原工程46檔，來源／測試／契約／版本及逐檔handoff都在同一提交。
- [Runtime Check #43714183868](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/43714183868)：**completed／success**，包含source-contracts、worker-typecheck、browser-typecheck及build；實際本地D1、完整Node及Vite由build job完成。
- 上一筆`8a376f3`僅補這份handoff的CI證據，沒有改程式；之後Build1收尾修正見下節。最新檢查以[PR #518](https://github.com/simonliu1118-byte/chihyuan-web/pull/518)檢查區為準。
- PR保留draft供Claude審查，base維持第二批PR #517；沒有合併、部署、修改父分支或遠端套migration。

## 官方查核與重要口徑

- 勞保：[6259分擔表](https://data.gov.tw/dataset/6259)與[6258級距](https://data.gov.tw/dataset/6258)交叉驗證；[部分月30天／分項舍入](https://www.bli.gov.tw/0014162.htm)。勞退[6274](https://data.gov.tw/dataset/6274)。
- 健保：[20246官方CSV](https://data.gov.tw/dataset/20246)、[月末計收](https://www.nhi.gov.tw/ch/cp-3204-6ecca-2568-1.html)。舊ODS403不採用，無登入繞過。資料集下載SVG及歷年resource context須隔離，不能把下一筆115年標成前筆100年。
- 最低工資：[現行歷年公告](https://www.mol.gov.tw/1607/28162/28166/28180/99861/28184/29016/)。原`70460/76761/76833`雖仍可檢索但直接下載410，已換到可實讀現行入口，不採審議尚未核定提案。
- 扣繳：[25627](https://data.gov.tw/dataset/25627)及[財政部1505](https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/withheld-rule/rule/NM11BZY)。國稅局download在不合Accept下可能回首頁HTML，改`*/*`且嚴格驗CSV；年度由官方起扣點交叉驗證，並核對5%／6%／18%、1.5倍與2000免扣語意未變。
- 病假／全勤：[勞動部115年Q7/Q10](https://www.mol.gov.tw/1607/28162/28166/28180/86983/87103/)、[勞工請假規則9條](https://laws.mol.gov.tw/flaw/FLAWDAT0202.aspx?id=FL014935&ldate=20251209)、[性平21條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=21&id=FL015149)。
- [生理假14條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=14&id=FL015149)、[加班費](https://www.mol.gov.tw/1607/28162/28166/28180/81521/81707/)、[補休先後與原日工資](https://www.mol.gov.tw/1607/28162/28166/28180/28198/28202/47031/)、[財政部加班免稅1125](https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/taxation-scope/which-income/7jOz7Dr)。

## 風險、待補及Claude必查

1. **不以測試通過代替薪資合法性確認。** 一般月薪核心已交付；月中投保／法定表分段、公傷保險抵充、未滿6月／短期流產產假與連續曆日、54／138協議及缺舊結清快照等列待補，不能確認。全薪一般產假沿既有正式曆日假單，需補完整連續性驗證；不得將半小時輸入規則解讀成可拆法定連續假。
2. 非每月獎金／兼職所得獨立扣繳、健保補充保費、外派及特殊投保身分、已發薪沖正與次月補扣流程尚未涵蓋；正式採用前Claude應核對哪些員工及制度適用，不能宣稱第三期所有法定情境已結案。
3. 工資基礎將主檔月額津貼列入；未滿月全勤的月額工資組成與實領折算分開，普通病假採MOL範例。Claude需逐條複核部分工時、調薪段、月底不足元、最低工資補足及特殊津貼是否還需獨立欄位。原主檔同名全勤會阻擋核對，不能默默重複給。
4. 官方一般受僱者表完整匯入／有效年度已驗，但未於正式Cloudflare環境執行排程，政府網頁改版、來源延遲或URL移動可能需調解析器；失敗要顯示／阻擋，不猜費率。未做向其他BOT推播通知；目前由設定頁與排程失敗狀態回報。
5. 權限複核：只有兩條更正路徑例外，不能擴大SA的人事／薪資權限；授權撤回競態、停用帳號、跨店／普通USER均須被擋。指定ADMIN名單由使用者在設定選，本輪沒有任何正式授權資料。
6. 交易複核：來源SQL與confirm/pay同一guard、唯一消耗、撤回／已發薪不可回寫、舊備份缺表／欄、同生效日append profile舊編輯鎖；所有變更Audit含前後／原因或追加式新內容。
7. UI複核：共用820px、1440／390真目視、表格長欄與金額可讀性、Dialog鍵盤／離開確認。Host測試用guard替身，只證明互動狀態，真正NavigationGuard沿既有完整測試。未新增正式薪資單列印／匯出模板。

## Build1最後複核修正（同工作項目，未部署）

原工程及純交接補證據的兩次Runtime皆成功（[第一次](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/43714183868)、[交接文件提交](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/43714466967)）。最後複核再發現手填計薪天數可與完整任職／實際出勤矛盾；Build1補上兩項阻擋：

- 無正式留停來源而手填少於任職期間30天制天數，不能確認。
- 即使有留停來源，手填天數仍不得低於已記錄正常出勤工時的下限；前端不能自稱留停，來源由Worker依正式狀態歷史判斷。

改動`shared/hr-payroll.ts`、`worker/hr/hr-payroll-service.ts`、`scripts/hr-payroll.test.mjs`及`BUILD`，其餘只同步本契約／版本說明／TODO／交接入口。新增兩項測試（實際SQLite與純核心）證明不能確認零天少發、留停也不掩蓋實際工作；Build1全套**891通過**、TypeScript／Vite通過。Schema、SQL來源／交易guard、權限及部署流程未改；最新CI結果從PR檢查區核對，不預填Claude通過。總PR仍僅本分支，47個變更檔案；沒有合併／部署／正式D1寫入。

## Claude審查欄（僅審查者填）

- 審查者／日期：待Claude。
- 結論：**待審，執行者未代填通過**。
- 需修正：待填；建議先審公式／法定邊界及已知未涵蓋，再審權限／交易與UI。
- 使用者未授權合併或部署；Claude通過後仍不得自行合併、部署或遠端套migration。
