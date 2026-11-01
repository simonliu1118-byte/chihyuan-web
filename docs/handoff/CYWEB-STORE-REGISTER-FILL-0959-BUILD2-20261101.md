# V0.9.59 Build 2：登記色塊、叫貨排序與日期選項，交 Claude 複審

狀態更正：本候選未單獨部署。使用者後續新增叫貨結果／日期／通知等要求，已整併升版 V0.9.60，發布與最新驗證以[新交接](CYWEB-STORE-DATE-NOTICE-0960-20261101.md)為準。首輪CI502/503的ERP測試setup非確定性問題也在該輪修正。

2026-11-01 Asia/Taipei；分支 `cyweb/store-register-fill-0959-b2`，基於main `13bc507f919bb386ea560b8fb39bda4167be7ec6`。使用者既有合併部署授權持續適用；Claude事後複審待填，GPT不代簽。同項UI返修BUILD2，VERSION仍0.9.59。

## 修改與原因

- `store.css`：登記26px正方實心品牌底色，border0／radius0，字色使用on-accent token以兼容深淺色；hover沿用品牌hover色。日期小視窗的輸入由142縮至112px，只限定門市進度，沒有全面變更共用DateInput或月曆尺寸。
- `StoreCustomerOrders.tsx`／`store.css`：移除可見叫貨結果標題與下拉，換三個互斥按鈕「已叫貨／缺貨／絕版／停產」，後者為單一選項。預設已叫貨，aria-pressed表示選中，隱藏的group label保留讀屏名稱。切換不提交，缺貨／停產隱藏日期；儲存才走原子API，未改業務結果契約。
- `erp-item-query.css`：叫貨紀錄每列原本繼承共用 `.cy-op-list-row` 圓角，疊上border-top後兩端呈弧形；只在 `.cy-ordering-history-row` 設radius0，保留1px直線、hover／active，未修改其他共用清單。
- `worker/http/ordering-routes.ts`：原排序created_at DESC／id DESC，與畫面送出日期不同。依使用者後續要求，history=1改sent_at DESC／created_at DESC／id DESC，同日以實際送出時間新到舊；未送出即作廢（sent_at NULL）置後。草稿及非history API排序維持原狀。沒有新增查詢、schema、索引或資料回填，history仍排除草稿且最多200筆（查201作超限判斷）。
- `scripts/ordering-route.test.mjs`：真SQLite測試建立早但送出晚在上、同日較晚送出在上、未送出作廢置後、草稿不受影響。`scripts/store-page.test.mjs`：三選一預設／選中／切換不送出／缺貨移除日期／儲存正確結果。
- BUILD、架構／TODO／CHANGELOG／交接入口同步。

## 驗證

`npm run build`（browser／Worker typecheck與Vite）通過，僅原有bundle／dynamic import提示；ordering route45、ordering page與store page30，重點合計 **75/75**。純CSS未新增鏡像樣式測試；以真瀏覽器檢查computed style及目視。

隔離真Store前端／API／SQLite合成驗收：登記26×26、RGB61/99/210實心、border0／radius0；日期輸入112px可完整顯示YYYY/MM/DD和日曆圖示；三選一預設已叫貨，切缺貨不儲存且日期消失，取消返回。叫貨清單使用實際共用class及正式CSS的合成樣式fixture：逐列radius0，第二列起border-top1px。排序由上述真API測試驗證，沒有把樣式fixture當作正式登入E2E。

本地合成圖 `outputs/store-0959-build2.png`、`store-0959-build2-choices.png`、`ordering-straight-divider-build2.png`。瀏覽器fullPage截圖曾回傳錯誤布局，已用正常viewport截圖重新確認三選一畫面，不以無效圖佐證。沒有操作正式業務資料、排程或Identity設定。

## 風險／Claude重點

深淺色字色token、直角僅叫貨紀錄、選項切換不提交流程；history／draft排序分界、同日時間、NULL作廢位置；日期112px完整可讀。既有日期篩選語意未在此輪擴充。排序只換既有單次查詢ORDER BY，沒有額外查詢或批次寫入；非常大量的歷史仍有排序成本及既有200筆查詢上限。

## 遠端驗證／發布

待本次source CI通過後依使用者授權合併部署；完成後補run／source／health。Claude最終審查待填。
