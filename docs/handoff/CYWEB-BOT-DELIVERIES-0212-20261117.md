# CYWEB V0.21.2 — 實際成果與手機審稿交接

## 範圍與狀態

- 使用者2026-11-13同意實作前輪設計，補充手機待審保留版本、送審時間、BOT、內容與狀態，但每筆壓成一至兩列。
- 原基準 main=d1407054310d65c7cf7543153d026c3b6a84aa16；2026-11-17整合最新 main=d04c6e03（V0.21.1），保留人事與商品變更；版本0.21.1→0.21.2、Build0。原本數量／可點閱內容使用不同來源、外部核准必須補審核，屬本輪新增成果流程修正。
- **未合併、未部署、未執行正式D1 migration。**本輪含資料模型／API行為，依既有複雜改動交Claude審查；不得把單純UI發布授權當成這次流程改動已獲發布授權。
- 小編原token、收據、routine、webhook、推播加密金鑰全部不動。正式查核僅唯讀；沒有通過／退回正式稿或重發任何社群內容，公開source／fixture不保存正式回報文案。

## 改動檔案與行為

### 資料／Worker

- `migrations/0077_bot_deliveries.sql`：新增實際成果ledger、巡視場次與短期圖片；稿與則增加externally_completed_at。既有post／patrol的sent items回填，不靠completion標題猜全文，不清除審核歷史。
- `shared/bot-center.ts`：external有效呈現狀態、成果與巡視摘要DTO；底層原review_status仍pending／approved／rejected，不虛構外部核准為CYWEB通過。
- `worker/http/bot-center-routes.ts`：新機器delivery／delivery-status／patrol-session／delivery-image及人員成果點閱；來源、長度、日期、URL、BOT歸屬在server驗證。cyweb必須連自己的已通過原則、內容一致；外部來源要全文與核准說明，可連原待審補登稿，只解決對應則，同批其他待審保留。
- 數量與清單都取bot_deliveries，complete純文字不再計文章。固定eventRef、來源則與發布URL防重複；舊sent來源可一次連結正式eventRef與空白平台／場次資訊，id不變、數量不增加。回報不是外部發布授權。
- 新成果INSERT、pending解決與一次完成事件同D1 batch；每次隨機write_key讓並行衝突只有勝出者可以解決對應待審稿，敗者不會誤標其他稿。新版本在寫入時檢查沒有新版；已外部處理不能再覆蓋。舊sent相容且可只回報已通過個別則，其他則仍待審。
- 巡視sessionRef固定，同日一場可更新label／40字note；送出數從同一ledger按session查，卡片不再貼長篇completion。未補場次的舊sent只顯示「已送出N則」，不推測早午晚。
- 圖片沿用檔頭驗證、2MB／10張及same-origin人員授權。外部成果圖以SHA-256去重，隔日清除，不是長期圖片庫。

### UI／工具

- `BotCenterPage.tsx`／`bot-center.css`：桌機原表格保留，手機用共用ListRow兩列，版本＋事項，時間＋BOT＋內容摘要，右側StatusChip。external可篩選／唯讀，不計待審。
- `BotReviewDialog.tsx`：手機一次一則，上／下一則；共用Dialog footer提供退回／通過，批次操作共用OverflowMenu，送審說明共用ExpandToggle。修正載入錯誤仍轉圈與切稿的過期回應問題。
- `BotImages.tsx`：抽出原審稿圖片呈現供兩處沿用；`BotDeliveryDialog.tsx`只組合既有Dialog／BotText／圖片檢視，不建立另一套底層元件。`BotSentPatrolDialog.tsx`及API client接同一份成果。
- `integrations/grok-bot/cyweb-work-reporter/`既定5檔更新：新增delivery、delivery-status、delivery-image、patrol-session。原report／complete的收據雜湊與路徑相容；新成果依server固定編號去重，斷線先讀回，不刪收據或換號繞過。routine仍用原四欄喚醒，只讀最新結果；external安靜略過。
- `VERSION`、`package.json`、`CHANGELOG.md`、`TODO.md`與`docs/architecture/BOT_CENTER.md`同步。`scripts/item-price-record-sheet.test.mjs`保留最新main以migration目錄動態核對marker的寫法。

### 備份

- `worker/backup/portable-backup.ts`／`schema-columns.ts`與`validate_schema.py`同步0077。ledger／巡視場次為業務資料；圖片、憑證、推播仍ephemeral，不進可攜備份。
- 舊備份restore upgrade從已sent items重建ledger，避免還原後實際已送出內容消失；新版完整restore保留ledger／session id及來源關係。UPGRADES按migration順序執行。

## 讀取成本

- 沒有新增背景歷史輪詢；既有30秒progress仍只查profile與credential／push狀態，測試禁止掃ledger、draft、completion。
- 主頁成果計數是kind＋當日範圍索引；文章首批只讀metadata，50筆keyset。點文章才讀一筆正文與圖片metadata，點留言N最多50則／頁；續頁由使用者操作，不一次載入所有歷史。
- 巡視場次最多50行，各場數量使用session_id＋sent_at索引；未分場舊成果另做當日有界計數。大量點閱仍有實際D1讀取成本，不宣稱零讀取。

## 驗證

- TypeScript、npm run build、npm run validate:source通過；後者用本機既有Python＋UTF-8模式，未安裝新執行工具。
- 29項聚焦測試通過：外部成果、權限、真實來源、日期、並行衝突、防重複、舊sent場次補登、原收據、10圖雜湊重試／隔日清理、新舊備份還原。
- 完整Node本機首輪834項、821通過、13失敗。其中3項為新版計數／marker斷言已依新契約更新，聚焦重測成功；其餘為Windows測試既有差異：backup-rehearsal的forward-slash esbuild替身路徑6項、secure-entry本機平台讀取1項、LF／CRLF schema fingerprint3項。未改這些無關業務程式，遠端Linux CI須全部通過後才可交付合併。
- 本機真實D1與遠端CI結果待完成後補在下方，不冒稱已通過。
- IAB合成fixture：390×844下clientWidth=scrollWidth=375、三筆ListRow各58.83px（兩列）；手機一次只渲染目前一則，切下一則正文正確。文章可點全文／外部核准來源，留言N可看實際全文，兩者無審核按鈕。1440×900桌機維持表格。預覽不是正式站登入驗收。
- 合成截圖在交付outputs：bot-01814-mobile-list.png、bot-01814-mobile-review.png、bot-01814-desktop.png，未放進Public Git。
- D1 batch原子語意已依官方文件確認：https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

## 發布後啟用順序／待辦

1. Claude檢查新成果來源、並行保護、舊sent轉換、備份及手機共用元件，將結論寫回本檔；本執行者不代填通過。
2. 使用者授權後，按既有main受控部署跑0077，確認版本、來源、D1、備份還原條件；不要手動改schema或輪換token。
3. WEB先部署後，再交小編更新既定5檔與共用技能。原憑證／收據／routine保留；不重跑pilot。
4. 小編核對目前已實際發出但缺完整成果的文章／留言，以固定事件與真實發布時間補登，連原補登稿；現有6則sent只補同場session，不重算。不得再補流程性審核或重發外部內容；不批次依標題猜歷史。
5. 實際驗收外部文章全文／圖片、留言N／場次、待審減少且其他稿不動、原推播讀回正常。拍板結案後臺仍不串接，FINANCE只沿用原progress摘要。

## Claude 最終審查

- 狀態：待審查。
- Claude意見／複審結論：待Claude填寫。

## 最終驗證／PR

待本輪檢查與PR建立後補記。
