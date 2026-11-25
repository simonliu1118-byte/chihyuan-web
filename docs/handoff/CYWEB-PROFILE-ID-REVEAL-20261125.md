# CYWEB V0.29.2 — 身分證就地顯示、我的資料重排、獎金視窗與關閉確認

## 狀態

- 分支 `cyweb/profile-id-reveal`，基於 origin/main（V0.29.1）。版本 V0.29.2、Build 0（新的獨立修改項目，Z + 1）。沒有 migration；未合併、未部署、未碰正式 D1。
- 使用者要求：2026-11-24 確認的設計（身分證就地顯示、我的資料重排）與 2026-11-25 回報的兩個問題（單一員工獎金視窗、取消顯示「切換模組」）。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `src/runtime/modules/NationalIdReveal.tsx`（新）、`ui/forms/record-sheet.css` | 共用就地顯示元件與樣式（按鈕固定 42px、值與按鈕不換行）。 |
| `HrEmployeeSheet.tsx`、`HrOperationalPage.tsx`、`hr-operational.css` | 改用共用元件；移除取號對話框與舊樣式；人事端取號 API 與稽核不變。 |
| `worker/http/hr-routes.ts`、`worker/hr/hr-self-service.ts` | 新增 `POST /me/national-id/reveal`（只依綁定列、無稽核）；自助 profile 加 `schedule_mode`、移除 `education`。 |
| `MyProfilePage.tsx`、`my-profile.css` | 帳號資料區；人事資料 6 欄格線（桌機）與兩欄卡片（手機）；移除學歷、工作經歷、備註、綁定使用者。 |
| `SharedIdentityPage.tsx`、`auth-client.ts`、`worker/identity/*`、`worker/http/auth-routes.ts` | Email 明碼：選填 `email` 欄位貫穿身分 principal 到前端；CYID 未提供時不顯示。 |
| `HrBonusPanel.tsx` | 單一員工：金額、備註併入同一張表單格、`medium` 寬；新增未輸入時不視為已修改。 |
| `ui/foundation/useUnsavedChangesGuard.ts`、`App.tsx`、`HrOperationalPage.tsx` | `canLeave` 預設改為「放棄未儲存的內容？」；模組切換在 App 傳 `MODULE_SWITCH_COPY`。 |
| 測試與文件 | `scripts/profile-id-reveal.test.mjs`（新）、`hr-ui-fixes.test.mjs`、`HR_MODULE_CONTRACT.md`、CHANGELOG、TODO、VERSION、package.json。 |

## 實作時的取捨（請確認）

1. CYID 回應目前沒有 Email，無法在本 repo 顯示明碼；先接好選填欄位（提供者回傳 `email` 即顯示），沒提供時只顯示「已驗證」標籤與「變更 Email」。
2. 自助 API 直接不再回傳 `education`（而非只在畫面隱藏），符合資料最小化；對應舊測試已改。
3. 關閉確認的修法放在共用層：預設文案改中性，模組切換才明確傳入原文案；`canLeave` 文案新增可選按鈕文字。人事頁籤切換保留「確定切換」。
4. 新增獎金視窗原本 `dirty` 初值為 true（一打開就視為已修改）；改為 false，未輸入直接取消不再詢問。
5. 整批獎金視窗維持 `large` 與員工選擇表（需要表格）。

## 審查清單

### Claude 審查

- [ ] 身分證：隱碼＋「顯示」同一行不換行；顯示後同格出現完整號碼、「隱藏」與「10 秒後自動隱藏」；按鈕寬度不變。
- [ ] 10 秒、隱藏、換員工、離開頁面後回隱碼，完整號碼不留在狀態。
- [ ] 人事端取號仍寫稽核；本人端 `POST /me/national-id/reveal` 只回自己的號碼、不寫稽核、未綁定 404。
- [ ] 我的資料：帳號資料區與人事資料欄位順序（桌機 6 欄、手機兩欄）符合設計稿；無學歷、工作經歷、綁定使用者、備註；空值為「—」。
- [ ] 單一員工獎金視窗：單一表單、無員工欄、`medium` 寬；整批模式不變。
- [ ] 取消／關閉對話框：有輸入顯示「放棄未儲存的內容？」，無輸入直接關閉；模組切換仍是「切換模組？」。
- [ ] 全部 Node 測試、typecheck、validate:source、build、validate:d1:local、`git diff --check` 通過。
