# V0.9.85 月度截止與備份清單交接（2026-11-02）

- 使用者直接交辦：每月待辦到隔月15日結束可編輯，16日00:00起鎖定；備份時間欄減20%轉給資訊，標題／內容同行。
- 分支cyweb/monthly-deadline-backup-layout-0984，開工基底main ac22b49，已整合main 8422d0d（保留V0.9.81備份還原與V0.9.82叫貨抽屜按需讀取），已整合後續main 4b36e2a（V0.9.83人事刪除限制），PR [#372](https://github.com/simonliu1118-byte/chihyuan-web/pull/372)。原保留0.9.84期間，main又合併備份排程PR373（d1dd475／V0.9.84）；本次整合該正式基底並順延V0.9.85，保留既有排程修正。沿用本對話既有遠端發布授權；Claude最終複審待填，不代簽通過。

## 修改與Owner

| 檔案 | 變更 |
| --- | --- |
| shared/store-monthly.ts | monthlyEditDeadline為次月16日，monthlyEditLocked以台灣日期比較，單一規則供UI／Worker使用。 |
| worker/http/store-monthly-routes.ts | 既有PK格／row讀取後、寫入與事件前檢查期限，409 MONTHLY_EDIT_CLOSED；USER／ADMIN／SUPER_ADMIN均適用。沒有新API或額外DB查詢。已成功requestKey的冪等重送不新增寫入，維持原契約。 |
| StoreMonthlyTodos.tsx | 逾期停用補登／改日期／取消完成，history仍可用；單一本機午夜timer與focus更新，已開的popover在期限到時隱藏，送出前以當下時間複查。無API輪詢／新renderer／observer／storage owner。 |
| BackupOperationalPage.tsx、backup-operational.css | 時間20%→16%、資訊34%→38%，dl改為標題／內容兩欄grid；標題粗體、值從同一行開始，過長值於值欄換行。備份操作與資料契約不變。 |
| store-monthly.test.mjs、store-monthly-ui.test.mjs | 僅新增主要截止案例：台灣午夜前1ms／當下、跨年，API三種異動及三角色不可逾期；開啟popover跨午夜鎖定且不重讀。既有UI測試固定日期避免期限導致未來失準。 |
| VERSION/package.json、TODO、CHANGELOG、STORE_MONTHLY_TODOS | 版本及當前規格同步。 |

| src/identity/CloudflareUsagePanel.tsx | 使用者追加：帳號與權限→系統與安全最近7天用量按ISO日期降冪。複製後排序，不改API原陣列／今日彙總／快取／D1查詢。 |

## 驗證與限制

- V0.9.85 build/typecheck、完整npm run validate:source通過。重點月度route/UI及backup UI及用量共48/48，未替純CSS增加鏡像測試。
- API合成資料：2026/11在2026/12/15 15:59:59.999Z仍可寫；15:59:59.999Z後1ms（台北12/16 00:00）三種異動均拒絕，原格／版本與事件不變，歷程可讀；2026/12跨年截止2027/01/16。
- 前端單位測試：開著日期popover跨截止午夜會鎖定／隱藏，沒有新增GET，history仍可開。
- 真瀏覽器合成資料：本月三格可用、歷史月三格停用、兩列history皆可用；備份時間／資訊實測198.08／470.44px，比例16%／38%，dt/dd同一行baseline（top差1px），手機390無水平溢出。
- 外部截圖outputs/monthly-deadline-backup-0985.png與monthly-deadline-backup-0985-mobile.png，全部合成資料，未放Public Git。本輪未執行任何正式備份／還原或正式月度異動，實作驗收正式D1讀0寫0。沒有schema/migration，不改既有資料。
- 已過期限的未完成格亦唯讀，符合使用者明確期限；沒有另設管理員解除鎖定。瀏覽器時間只作呈現，實際請求由Worker時間判斷。
- 最近7天以亂序合成資料渲染實際元件：2026/11/02→2026/11/01→2026/10/31，原輸入陣列不變；此純顯示排序未增加永久鏡像測試。整合main V0.9.83後重跑build/typecheck、48/48及完整validate:source均通過。
- 完整Linux CI及部署證據待回填；Claude複審待填。

- e24721f完整Linux CI 601/601與全部必要檢查通過；合併前main新增PR373，已保留其全部內容並重新驗證，最新CI待回填。
- d1dd475整合後build/typecheck、完整validate:source與月度／備份／用量／排程重點56/56通過；未再次改動已驗收版面。
