# 共用電話與日期輸入

V0.9.59 在既有 `src/ui/forms/` 新增共用輸入。事前檢查現有 foundation 與 AITeam shared visual，沒有同等元件。

## PhoneInput / PhoneText

`shared/phone.ts` 負責數字正規化、台灣區碼格式與游標換算；`PhoneInput.tsx` 為受控輸入，value／onChange 使用純數字。完整號碼顯示 `(07)236-8520`／`0912-345-678`，未知或不完整長度保持數字，不猜區碼。接受全形數字。

Backspace／Delete 跳過格式符號，按數字位置刪除。複製只含選中範圍的數字，剪下同時刪除該範圍。PhoneText 提供唯讀格式及選取複製；跨元件選取保留一般複製行為。區碼參考數位發展部[電信網路編碼計畫](https://www-api.moda.gov.tw/File/Get/moda/zh-tw/GvvKwygqxJeenqO)，server 仍為驗證權威。

## DateInput

`shared/date-input.ts` 提供台北當日與真實日期換算；`DateInput.tsx` 為受控 ISO 日期，顯示 YYYY/MM/DD，支援 min／max、required、disabled 和原有 Enter 換欄。

互動參考 CYACCWEB 現行 [adaptive-ui.js](https://github.com/simonliu1118-byte/CYapps/blob/main/apps/CYAccountingWeb/public/adaptive-ui.js#L1753-L1965) 與 [quick-entry-settings.js](https://github.com/simonliu1118-byte/CYapps/blob/main/apps/CYAccountingWeb/public/quick-entry-settings.js#L41-L104)，外觀使用 CYWEB token。

- 四碼 MMDD（台北當年）、八碼 YYYYMMDD、斜線／連字號、全形；無效日期阻擋提交。
- 日→月→年，十二月份／十二年份、前後切換、今天；選日即關閉，只選值不自行提交業務。
- Ctrl+上下鍵增減一天；外點／Esc 關閉，Esc 不連帶關閉父視窗。
- 原生 popover top layer 避開表格／Dialog 裁切，日曆230px、觸控296px，依 viewport 定位；輸入142px，不撐寬文件。

用於顧客訂購、黑名單電話與月度待辦，沒有全面替換無關模組。無日期勾選屬進度編輯器業務，不放在共用 DateInput。
