# V0.9.80 月度待辦完成標記（2026-11-02）

- 使用者直接交辦：勾號正常尺寸，日期小字放下面，仿門市訂購上方小年份，不增加列高；本輪為單純UI修改，依既有授權可合併部署。Claude事後複審待填，未代簽通過。
- 分支cyweb/monthly-completion-mark-0980，基底main 5fb8418；PR [#367](https://github.com/simonliu1118-byte/chihyuan-web/pull/367)。
- StoreMonthlyTodos.tsx：日期與勾號改為上下兩層，已完成按鈕統一沿用cy-store-check；同年MM/DD，跨年YYYY/MM/DD，無日期維持單勾。aria-label/title完整日期、日期編輯及API不變。
- store-monthly.css：17px勾號、9px日期，固定18+10=28px；沿用原辦理列39px。刪除月度原橫排stamp/check規則，沒有疊加共用日期樣式，門市訂購不受影響。
- VERSION/package.json、TODO、CHANGELOG同步。無schema、Worker、資料寫入或新owner／observer／wrapper；正式D1讀0寫0。
- 驗證：既有月度UI測試8/8、V0.9.80 build/typecheck通過；合成畫面實測勾17px、日期9px、內容28px，兩筆辦理列均39px（同年／跨年），無日期仍單勾。外部截圖outputs/monthly-mark-0980.png，未放Public Git。僅更新既有測試的顯示文字預期，不新增測試。
