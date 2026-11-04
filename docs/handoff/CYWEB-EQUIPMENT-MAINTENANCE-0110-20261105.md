# V0.11.0 出機紀錄與定期維護交接

- 2026-11-05（台灣），GPT；分支 `cyweb/equipment-maintenance`；基準 main `1e7ff249a1f0fea7ef0ff6e927934c2a2b1800b7`（V0.10.25）。
- 使用者直接交辦、確認設計後實作；**後續明確特例授權「可以合併部署（寫 handoff）」**。本次依授權在檢查通過後合併及受控部署；Claude 事後複審待填，GPT 不代填通過。
- 新能力包含出機建檔、跨年排程、同院同月彙整及到訪登記，屬完整功能階段，依共通版本規則升 Minor 為 **V0.11.0 Build 0**。不是單純 UI 升 Minor。
- 現行業務契約：[STORE_EQUIPMENT_MAINTENANCE](../architecture/STORE_EQUIPMENT_MAINTENANCE.md)。PR、CI、正式部署結果在完成後回填。

## 已完成及使用者更正

- 售後維修只用一組共用切換：「門市送修／出機紀錄／定期維護」，沒有第三層切換；既有維修功能保留。
- 出機保留客戶編號／名稱、品牌、機型、銷售日、數量、保固起訖／月數、每台序號與製造年月；數量暫時清空或重輸入不會先丟失既有序號草稿。
- **最後決定是客戶編號可空**、客戶名稱必填（取代稍早兩者必填）；編號空時鎖定不需維護，控制項有原生 tooltip，後端也拒絕繞過。客戶碼 trim＋NFKC＋大寫後彙整。
- 出機頁勾選預計年月，可帶入每半年建議。維護表依客戶碼＋預計年月合併同次到訪；不逐台登記，不做逐台檢核結果。
- 直接引用既有 StoreMilestoneButton／StoreMilestoneDateFields、DateInput、Field、一行備註及既有格內小視窗。儲存後顯示日期或無日期勾號，日期 Enter 移到備註、備註 Enter 送出；取消、點外面不送出。大型表單只有取消／儲存，不提供右上 X 或點外面關閉。
- 完成摘要只保留當時涵蓋出機；已移除但未曾到訪者不被列入。已完成到訪不因修改機型、取消排程、清空客戶編號或保固到期消失；新出機不能默認繼承已完成維護，需先取消登記再調整。
- 原維修客戶編號／姓名從12em再加至13em（13px字級下169px），差額仍由故障狀況吸收，驗證六碼編號＋七字院名單行。

## 修改檔案與原因

| 檔案 | 修改內容 |
| --- | --- |
| `shared/store-equipment.ts` | 共用型別、長度／傳輸相關界限、日期／月份檢查、客戶碼正規化、含月底及閏年的保固月數計算、半年月份建議。 |
| `migrations/0051_store_equipment_maintenance.sql` | 五個新表：出機主檔、客戶月到訪、排程關聯與完成摘要、歷程、原子修改版本；不重寫舊 migration，不搬動既有資料。 |
| `worker/http/store-equipment-routes.ts`、`worker/index.ts` | 原 STORE_REPAIRS 權限後端 enforcement；建檔／修改／彙整／登記／更正／取消登記／分頁歷程。requestKey＋hash 防重送及誤用，版本 guard 與所有寫入同一 batch。 |
| `src/runtime/modules/StoreAfterSales.tsx`、`StoreEquipment.tsx`、`store-equipment.css`、`StorePage.tsx` | 共用單層切換、出機表格與彈窗、跨年月份勾選、維護總表／日期與單行備註，來源雙向查看；手機沿用流程表格的適應式呈現；清單不因點選整排染藍。 |
| `src/runtime/modules/StoreRepairs.tsx` | 客戶欄加寬13em。 |
| `src/ui/data/OpenOnlyToggle.tsx` | 增加可選 openLabel；維護用「顯示未完成」，其他呼叫者保持原預設。 |
| `StoreOperationHistory.tsx`、`change-log-labels.ts`、`AuditOperationalPage.tsx` | 沿用收合 chain 歷程，新增欄名及中文 Audit 類別／動作；維護修改只列日期前後與本次備註，不輸出完整機身陣列。 |
| `worker/backup/portable-backup.ts`、`schema-columns.ts`、`scripts/validate_schema.py` | 五表納入欄位型 portable backup；CURRENT_MIGRATION=0051；新表不需 UPGRADES 語意轉換，舊備份缺表恢復空表。 |
| `scripts/store-equipment.test.mjs` | 18項實際 SQLite／handler 測試，涵蓋權限、可空編號、驗證、同院彙整、防重送、衝突、完成摘要、分頁、延遲讀取及備份 round-trip。 |
| `worker/acceptance/equipment-acceptance.ts`、`d1-local-acceptance.ts`、`scripts/validate_d1_local.py` | 新增真實 Wrangler D1 驗收；全體19組含新 JSON／batch／彙整 guard 及備份流程。 |
| VERSION／package.json、架構資料字典／入口／UI清單、TODO／CHANGELOG／handoff | 同步新能力、邊界、版本、驗證與審查狀態。 |

## 一致性與 D1 成本

- 沿用既有身分／模組使用權，無新 credentials、角色或外部服務；沒有新 cron／背景輪詢。
- 出機及維護清單每頁100筆，歷程50筆；索引 keyset，多取1筆判斷下一頁。出機清單省略機身陣列，展開／修改才讀單筆，並重用目前清單已讀的資料。搜尋仍可找序號。
- 維護頁直接使用已保存的彙整資料，不由前端掃完所有出機再分組。操作紀錄展開才讀，沿用既有 bounded LRU；不在載入清單時預抓所有歷程。
- 資料保存後直接套用單筆回應，不因儲存再抓全清單。業務 GET 不預建月份或寫入排程。
- 一個全域版本 guard 協調跨出機／到訪的合併；並行時回409，不會提交部分資料、孤兒事件或失配 Audit。涵蓋內容變更也會使已開啟的到訪編輯器版本失效。
- 若取消所有目前排程，未完成且無涵蓋資料的到訪不出現在清單；已完成到訪保持可查，摘要不被新資料倒填。沒有硬刪除業務紀錄功能。

## 驗證

- `npm run typecheck`、`npm run validate:source`、`npm run build` 通過，建置只有既有 bundle 大小提醒。
- 最後相關測試：**61/61 通過**（出機18項、既有訂購／維修與異動紀錄）。
- 完整本機 Node 當輪638項、627通過／11失敗；失敗是已在前版 main 驗證的相同 Windows 基線：backup-rehearsal-http 6項503、deployment-source 1項LF／CRLF、secure-entry 1項Windows URL pathname、store-backup-upgrade 3項舊migration LF／CRLF指紋。沒有為規避失敗修改測試或相關產品流程；之後新增2項保留摘要／清單延遲讀取測試已於最後61項通過，完整Linux CI另列。
- `npm run validate:d1:local`：全部 migrations至0051、**19組 Worker＋真實D1驗收全部 PASS**，亦通過正式身分 session 表退休檢查。最後 Windows TemporaryDirectory 清理因 Miniflare metadata.sqlite占用報WinError32，指令exit1；不把它寫成exit0，完整指令另由Linux CI驗證。
- 本機瀏覽器使用真實 React 元件與真實 handler＋SQLite（只有 Identity 與其他模組回應為合成替身），未接正式ERP／D1／R2；合成建檔、保固帶入、未填編號停用tooltip、兩筆出機合併、登記、更正無日期／有日期、歷程、雙向查看、Enter順序與390px手機均確認。
- 桌面姓名欄169px且只有一個文字行；手機 viewport390px、body.scrollWidth375px，頁面無橫向溢出。新增修改表格內可水平捲動以容納機身欄位。
- `git diff --check` 通過。圖片已逐張檢視；尺寸、bytes、SHA-256如下，提交後再read-back核對。

## 合成畫面證據

| 圖片 | 尺寸 | bytes | SHA-256 |
| --- | --- | --- | --- |
| [01-dispatch-form.jpg](EQUIPMENT-0.11.0/01-dispatch-form.jpg) | 1905×1000 | 113582 | `84d42de934fe901ca8e95b7f116db0fdd1feb3e71ff764fc892da04b09b42534` |
| [02-maintenance-entry.jpg](EQUIPMENT-0.11.0/02-maintenance-entry.jpg) | 1905×1000 | 87375 | `fc0f13d6e73999d85a15d962e318ae874f4d4a023f7809bf2317a6221af91925` |
| [03-maintenance-history.jpg](EQUIPMENT-0.11.0/03-maintenance-history.jpg) | 1905×1000 | 106177 | `045ec2f05f175b037fb1176ba7a9c2d5e4a8c31a5bd99ef3d07b3423a12cd015` |
| [04-dispatch-list.jpg](EQUIPMENT-0.11.0/04-dispatch-list.jpg) | 1905×1000 | 97825 | `a600df5810321b8bcb1f079caf69fb8f6de47cbb507f2c7d373aa8ee742be6d5` |
| [05-maintenance-mobile.jpg](EQUIPMENT-0.11.0/05-maintenance-mobile.jpg) | 390×844 | 30407 | `95c6bcd66bb6426efb94152d59b7d65f0aa995206a64352939f2fa1c9363add4` |
| [06-repair-column.jpg](EQUIPMENT-0.11.0/06-repair-column.jpg) | 1905×1000 | 104365 | `557212e6f7e8b88bdad99c797ca0a4f6ef32dc94b9c50451b7476343e5a0b402` |

## 發布與 Claude 接續

實作完成；依使用者本次特例，在必要CI成功後合併並以 main 的受控 `development-deploy.yml / deploy-development` 發布。實際PR、CI、main SHA、run與正式健康確認將回填本檔。

Claude 請事後核對：客戶碼可空但不可維護、同客戶同月彙整、完成摘要 retained、不能把新出機默認已維護、同步修改衝突與整批rollback、舊備份缺表升級，以及共用元件／手機操作。

### Claude 最終審查

待 Claude 填寫；GPT 未代填通過。
