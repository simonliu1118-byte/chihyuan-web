# CYWEB V0.18.13 BOT 巡視摘要與發布點閱交接

- 分支：cyweb/bot-patrol-summary-01813，基準main3385578a；VERSION/package=0.18.13，BUILD=0。
- PR：[511](https://github.com/simonliu1118-byte/chihyuan-web/pull/511)；工程提交ac0f9970，後續格式與技能示例補正不改runtime行為，Claude結論仍待填。
- 使用者先要求財務回報查核、Threads從次改則及待核准N紅字，隨後明確確認N為「今日實際送出的海巡回覆數」，補充N可點開、下方巡視名稱／狀態與摘要由小編回報；新文章N篇不可點、逐篇發布紀錄可點開全文，完成後提供小編交接文字。
- 單純UI可合併部署與handoff供Claude事後審查的既有授權沿用；本輪只增加查看功能，不改審核／發布流程或正式資料。因新增獨立查看能力，從0.18.12升Z到0.18.13，沒有交付過的Build1草稿不保留為版本。

## 財務查核與資料最小化

- 正式只讀FINANCE profile的狀態、updated_at、summary長度與credential已配置旗標：回報為台北當日、摘要非空、狀態done；沒有讀取正文／token_hash／金鑰或寫入正式資料。財務卡片使用同一profile當日summary，因此資料來源正常。
- 正式IAB尚未登入，沒有代登入或抽取session，不能將此稱為正式畫面目視驗收。另以合成當日財務progress驗證卡片呈現為完成／摘要。
- 本handoff／測試／Git不含正式財務摘要、資源識別或憑證。

## 修改檔案與行為

- shared/bot-center.ts：SentItemSummary／SentItemView／分頁型別、文章published metadata及巡視reports；舊count/latest/reviewed等欄位保留，避免把完成批次改成則數或破壞現有讀取。
- worker/http/bot-center-routes.ts：共用sentItemsPage有界查詢、BOT_CENTER權限內GET sent-items、kind／cursor／scope驗證、台北當日與最新稿篩選、sent_at/id keyset分頁。主頁新增逐篇post metadata首批，巡視reports取代原latest巡視查詢；正文按需查，不增加30秒背景歷史查詢。
- src/runtime/api/bot-center-client.ts：海巡明細與文章metadata的讀取函式，沒有BOT機器權限擴張。
- src/runtime/modules/BotCenterPage.tsx：Threads「今日巡視N則」用sentToday並開送出回覆視窗，下面列BOT完成回報的title/detail；文章每一post item一列可點，總篇數維持strong純顯示；待核准strong加紅色class。發文／巡視內容太多按需分頁，卡內summary可捲動、不加展開收合。
- src/runtime/modules/BotSentPatrolDialog.tsx：沿用Dialog、Loading，逐則只讀全文／時間，每頁50，錯誤可重試；跨午夜續頁重置到當日，不混接兩天。沒有外側點擊關閉或右上X。
- src/runtime/modules/BotReviewDialog.tsx：onlyItemSeq只呈現選定發布項目，隱藏同批其他篇、批次備註、目錄／版本導航及審核按鈕；保留原共用視窗與項目圖片。沒有改審核API。
- src/runtime/modules/BotText.tsx：從既有審稿視窗抽出相同安全文字／http(s)連結呈現，供回覆／摘要共用；不解析HTML或執行BOT文字；提交前同步正規化抽出檔案的檔尾空白。
- src/runtime/modules/bot-center.css：既有危險色token呈現待核准N紅字；點擊數字、卡內摘要／明細及單篇布局，不新建視覺元件或配色。
- scripts/bot-deliveries.test.mjs：已送／未送／退回／post隔離、metadata不帶正文、時間邊界、同秒分頁完整、送出索引、BOT原始巡視命名、權限／cursor／scope與唯讀查核。
- scripts/bot-center-ui.test.mjs：更新既有卡片契約斷言。VERSION／package版本同步，BUILD仍0。
- TODO／CHANGELOG／BOT_CENTER／handoff README同步。共用技能SKILL與wire-contract增加巡視title/detail和逐篇sent＋complete規則；不改原tool程式、收據fingerprint、憑證、routine。

## D1讀取與限制

- 主頁比原先多一個有界post item metadata查詢（51取50），巡視reports則替代原latest巡視查詢，最多50個巡視事件；索引以work_type／completed_at與sent_at限制當日範圍，沒有每30秒掃業務歷史。
- 點N才讀最多50則海巡正文，載入更多才續查；發表列表首批不讀正文，點單篇沿用原draft detail三類查詢（稿／最多50則／圖片），UI只顯示那一篇。大量點閱仍有實際D1讀取成本，不宣稱零讀取或永遠固定總量。
- sent-items與sentToday採同一個已送出的patrol item來源；未送出、退回、其他日期或被取代版本不列入。既有無items的legacy draft不冒充逐則海巡或猜為已發布文章；技能已明確改為貼文只有一篇也用kind=post與一個item，一般工作才可省略items。
- 單篇批次亦顯示原整稿附圖；多篇批次必須image.item指定歸屬，批次共用圖不混入任意一篇。審核圖片依既有隔日清理政策，不承諾長期保存公開平台的圖片。Grok實機與正式發布全文尚待小編更新後驗收。

## 驗證與發布（待補齊）

- TypeScript、npm run build與npm run validate:source通過；BOT／Grok／備份marker相關70項測試全數通過。雲端完整Node與local D1驗收以PR最新結果補齊。
- IAB合成fixture：點巡視N只顯示實際送出的第一則，未送出的第二則不出現；點文章第二篇只見第二篇全文，不出現第一篇或批次說明，也沒有審核按鈕。新文章N沒有button；待核准computed color為既有危險紅色rgb(255,138,128)。手機390寬client／scroll均375，沒有整頁水平溢出。
- 沒有migration或正式D1寫入；發布證據待完成後填寫。
- 共用技能quick_validate通過；更新包只有既定5個工具／技能檔，解壓CLI通過；24002bytes，SHA256=3c96a47c952b907bf7e67ac47cf802b2da80ebe23d754f71cb4f5e3277b09443。工具程式本輪不變，只更新技能與回報文字規則，原收據及routine不變。

## Claude事後審查（由Claude填寫）

- 結論：待審查。
- 重點：N與逐則內容一致、台北日期與keyset、不把巡視事件當回覆數、單篇內容不誤帶同批其他篇、權限、按需D1讀取與共用元件、正式財務內容不進Public。
