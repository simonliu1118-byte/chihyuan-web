# CYWEB V0.12.3 Build 1 BOT 管理中心與 Grok 回報交接

- 執行：GPT；同分支 `cyweb/grok-reporting-kit-0123`、[PR #447](https://github.com/simonliu1118-byte/chihyuan-web/pull/447)。基準 main `79a9138b6082a1d32c8392dec7bc61326cdf963e`；VERSION／package.json=0.12.3，BUILD=1。同一回報整合與原參考圖驗收返修，依規則增加 Build，不另開平行工具 PR。
- 使用者確認設計並授權開工：每 BOT 獨立憑證；**小編現在的憑證保留**；更新工具、技能、handoff；通過不問理由、退回才必填；待審核 → 四張工作摘要 → 同行時間軸 → 四張當日 BOT 摘要。拍板結案後臺先不接，使用者另外明確指定**推播下一輪**。
- 使用者2026-11-08明確授權「PR447可以合併部署，記得更新handoff，完成後再來處理推播」。PR #447已合併、V0.12.3 Build1正式部署成功，受控workflow套用0057；沒有取得或輪換小編明文憑證，沒有修改／部署CYapps或CYERPAutoQuery。Claude事後複審及新版UI／原key實機驗收仍待辦，不代填通過。
- 交付前逐檔核對發現首個Build1提交漏帶後臺檔案；補提交`bot-center-routes.ts`為同一份已通過本機測試的內容，未擴充行為。`ce360513`的中間CI不作驗收依據，僅以補齊後最終head為準。

## 憑證與 migration

1. `0057_bot_scoped_credentials.sql` 重建原 ephemeral 憑證表，以 bot_id 作主鍵、token_hash 唯一。舊 singleton 的**同一雜湊、產生／撤銷時間、操作人**直接綁到 code=SOCIAL_EDITOR，不假定ID=1，不重新產生，不需明文；小編在 Grok 的原值保持不變。只有舊憑證列存在才補小編主檔，空白還原目標不預先種 BOT。
2. `bot-center-routes.ts`：產生／輪換／撤銷改到 `/bots/:code/credential`，僅 SUPER_ADMIN 可寫，一個 BOT 一筆。憑證與 Audit 同 batch；Audit 僅記 BOT 代碼及操作，不含明文或雜湊。舊全域 `/credentials` 不再提供，不能誤輪換全體；狀態回傳 credentials 陣列，無祕密。
3. ingest 以雜湊唯一索引查詢所屬 profile，Bearer 只能操作自己。body／query 可省 botCode；有傳但不符403。按 ID 讀另一 BOT 草稿404、按外部編號冒用另一 BOT403。`GET /api/bot-ingest/identity` 只回 botCode／botLabel。沒有每次呼叫寫 last_used，不新增心跳成本。

## 版面與審核

4. `BotCenterPage.tsx`／`bot-center.css`／client：標題旁灰字與提示性文字移除，日期是實際資訊仍保留；「待我審核」改「待審核」。通過直接送出且不保存理由；退回共用 prompt 必填理由，Worker 也驗證。既有並行勝出者與 Audit 原子回滾保留，沒有發布操作。
5. 工作摘要位於待審核與時間軸之間，桌機四欄。新文章與巡視取明確完成分類的台灣當日完整數量及最新摘要；待核准含舊日未處理稿件。**拍板結案只顯示標題與「—」，沒有後臺欄位／分類／查詢／計數**。
6. 時間軸每項時間、BOT、標題、詳情同行直接顯示，無展開或第二段縮排；長文字可自然換行，空白換行不強制撐第二段。其下各 BOT 只顯示名稱、狀態與當日摘要，桌機四欄、中等寬度兩欄、手機單欄；沒有卡片回報／待審按鈕、統計或摘要展開。過期摘要顯示今日尚無回報，BOT 卡固定保留全體。
7. 設定使用共用表格，每 BOT 一列狀態／產生時間／操作；憑證一次性視窗標明 BOT 名稱。沿用 Dialog／Field／StatusChip／StatusFilter 等，不另做 UI 元件。所有視窗無 X、背景與 Escape 不關閉。

## 分類、去重、讀取與備份

8. 完成事件增加 `work_type`（general／article_published／threads_patrol）、`event_ref`。舊資料維持 general，不猜標題或把送審、核准當發布。非 general 必填 eventRef；同 BOT＋eventRef 唯一，相同內容回原紀錄、異內容409。明確 supplied completedAt 也須相同，不填則不把重試當下時間當衝突。
9. `workSummary` 為目前 BOT 範圍的 articles／patrols／pending，不受50筆分頁截斷；pending跨日。原當日完成GROUP BY加分類，新增兩筆分類索引LIMIT1及一筆最新待審讀取；有日期／分類與BOT日期／分類索引。30秒仍只讀progress主檔與憑證，沒有歷史／完整統計輪詢。
10. `schema-columns.ts`／`portable-backup.ts` 納入完成新欄位及0057 marker，舊備份缺欄位用general／null預設。憑證表依舊排除，還原後重新逐BOT發行；正式migration保留小編原憑證與備份還原是不同情境。

## 共用工具、技能與封裝

11. CLI `check` 改以identity驗證實際憑證歸屬，不再用查不到稿件的404推論連線成功。complete接受workType，固定eventId作eventRef送伺服器；general舊收據fingerprint維持相容，更新不刪收據、不重送或把舊事件改算文章。report仍只有本機收據，不泛稱所有操作有跨主機exactly-once。
12. `SKILL.md`及兩份reference同步獨立憑證、工作分類、錯誤處理與啟用順序。Node22+無第三方執行依賴，僅安全環境注入；無員工登入／自行核准／憑證管理／任意URL／對外發布命令。文章實際發布與巡視完成才送指定分類，測試用general。新版ZIP名含Build1，五檔白名單，不含設定或真實資料，不進Git。
13. **先部署 WEB＋0057，再更新 Grok 工具／私人技能；保留小編原secret與持久收據，不按輪換。**其他 BOT 各自產生自己的key。新版check確認SOCIAL_EDITOR歸屬，原送審／核准流程仍是BOT主動讀取；推播、webhook與routine留下一輪，本輪沒有背景發送。

## 驗證與限制

- `node --test scripts/bot-center.test.mjs scripts/bot-scoped-credentials.test.mjs scripts/grok-bot-reporter.test.mjs scripts/store-equipment.test.mjs scripts/backup-migration-level.test.mjs`：**54/54通過**。覆蓋舊key雜湊／時間原樣遷移且code不等於ID、跨BOT所有寫入／兩種草稿讀取拒絕、單BOT輪換撤銷、超管限制、機器不能用key審稿、通過無理由／退回必填、並行審核及Audit失敗回滾、分類去重與內容衝突、超50筆完整統計／台灣日邊界／篩選、分類資料備份還原及憑證排除、舊general收據相容、CLI實際HTTP及錯誤不洩漏token。
- `npm run build`（含browser／Worker TypeScript）通過；既有dynamic import與bundle size提示仍在，沒有新依賴。
- 初輪原工具提交`6b97f4d5`及交接提交`9f99b4ca`的[Runtime #42374905873](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42374905873)、治理與部署契約檢查已通過；**不是本輪Build1 CI證據**。本輪最終head完整CI以[PR #447檢查頁](https://github.com/simonliu1118-byte/chihyuan-web/pull/447/checks)及PR說明中的精確run證據為準。
- 實際React元件配合本機合成API，已觀察到待審核 → 四張分類卡（拍板僅—）→ 詳情直接顯示的時間軸 → 四張無操作BOT摘要。舊CUA工具在測試中途被停用，新browser技能檔在安裝目錄缺失（已搜尋），因此未冒充已完成新版互動／手機視覺驗證；請Claude補驗通過直接儲存、退回必填、設定表及窄螢幕。合成預覽仍在ignored .tmp，不進公開Git。
- 後續找到桌面工具提供的Python；PyYAML只裝在ignored .tmp測試目錄，官方`quick_validate.py`通過。Node亦檢查frontmatter／命名／references與scripts完整性。`validate_schema.py`以UTF-8執行通過：58 migrations、131 tables、10組驗證。沒有增加應用依賴，也未宣稱已更新Grok私人技能。
- 新版`cyweb-work-reporter-v0.12.3-build1.zip`共五檔、17,166 bytes，SHA-256=`fb6732d784cb08f144b5b3cf12b50ce28dae6e5df57168d8b2483e6f74f3736f`。獨立OS暫存目錄解壓執行CLI成功，無npm安裝；ZIP僅外部outputs交付，不進Git。使用者的小編曾使用舊key，不代表新版已正式部署或完成實機驗收。

## Claude 接續

- 請核對 migration 原樣保存與機器所屬權限、單BOT輪換／撤銷、草稿ID不洩漏、審核原子性、分類去重／完整統計與backup契約。
- 0057把憑證主鍵由singleton id改為bot_id，舊Worker不相容；受控流程套migration後須接續部署新版。兩者之間BOT API可能短暫不可用，部署前暫停BOT寫入、健康與原key身份確認後恢復；若部署失敗，應完成新版forward修復，不能只退回仍查singleton欄位的舊Worker。其他業務表不受此主鍵調整影響。
- 補完上述實際UI／手機驗證。正式部署須另有使用者當次授權，從main受控workflow套0057，不手工改正式DB或取出key。部署後請使用原小編安全key跑新版check驗證身份，不需將key或雜湊貼到聊天／PR。
- **Claude事後複審及新版UI／原key實機驗收待辦；PR #447已依使用者本輪授權合併部署，不由GPT代填審查通過。**

## 2026-11-08 正式發布結果

- [PR #447](https://github.com/simonliu1118-byte/chihyuan-web/pull/447)已合併；正式source=`e2f50177d4e4d1162644c604a40dc41a4cb3f39e`，VERSION=0.12.3、BUILD=1。從main dispatch既有`development-deploy.yml`，沒有改部署入口或建立新服務／資料庫。
- [部署 #42391275622](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42391275622)成功；validate-deployment-contract與deploy-development兩個job成功，其他audit分支按operation跳過，不將skipped當發布證據。
- 正式migration步驟確認`0057_bot_scoped_credentials.sql ✅`。既有singleton雜湊依migration原樣歸屬SOCIAL_EDITOR，未重新發行小編key。新版schema／Worker均已上線，不可單獨退回查舊singleton欄位的Worker。
- canonical與workers.dev兩端HTTP200，version=0.12.3、consumer=1.0.5、database=ok、sourceCommit均為上述e2f50177；HTTPS／靜態資產、無效session拒絕、排程及正式portal authority檢查通過。Build1由該正式source的BUILD檔核對；health契約只回基礎版本，不冒充它有build欄位。
- 這輪只新增部署證據文件，不升版、不再次發布。正式source仍是e2f50177，即使後續main因文件提交前進也不把文件commit寫成已部署source。
- 下一步可更新Grok工具／技能並以原小編secret跑check，不刪舊收據；正式key回讀與UI／手機視覺仍需驗收。使用者要求本輪發布與交接完成後再處理推播，推播另起後續工作，不在這次已部署source內。
