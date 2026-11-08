# CYWEB V0.12.9 — 進貨輔助重複品項可取消

2026-11-09 · 分支 `cyweb/restock-duplicate-cancel-0129-20261109` · 起點 main V0.12.8 `fc8f57be95361fea4fc4407c7def12217be57442`。

## 使用者要求
當進貨輔助「加入」遇到選定草稿已有同品號、同單位及同區段、未結掉的既有列時，原本「新增一列」「加到既有列」之外增加真正「取消」選項。取消後不應新增、修改品項或更新上次使用的來源。

## 修改
- `src/runtime/modules/RestockAssist.tsx`：以原 Dialog 呈現三個明確動作。選取既有列先停下等待決定，取消只關閉此選擇，新增／加入原有列共用原單一 `saveLine` 業務寫入路徑。
- `scripts/restock-layout.test.mjs`：新增取消不寫入、兩個加入選項存在與新增列路徑檢查。
- 更新版本、規格、CHANGELOG、TODO；不更動 Worker、D1、CYID、權限、正式 API 或其他 UI。
- 同一個進貨輔助共用模組涵蓋手機及桌機；不另建手機 owner。沒有 observer／retry／wrapper。

## 驗證與授權
- GitHub Runtime、Governance、部署契約需通過後才可合併部署。
- Claude 事後複審、桌機與手機實機驗收待辦；不得以 CI pass 取代。
- 使用者先前授權本輪工作完成後合併部署，追加本項時未撤回。
