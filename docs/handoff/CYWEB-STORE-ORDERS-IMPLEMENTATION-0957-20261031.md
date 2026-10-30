# CYWEB V0.9.57 — 顧客訂購流程與黑名單事件實作交接

日期：2026-10-31（Asia/Taipei）。設計來源：[設計方案](CYWEB-STORE-ORDERS-WORKFLOW-DESIGN-20261031.md)、設計 PR #323 與本對話使用者補充。
狀態：GPT 實作完成、待遠端驗證與 Claude 最終審查；不合併、不部署、不執行正式 migration。使用者只授權單純 UI 直接部署，本輪跨資料／流程不適用。

## 1. 功能
- 訂購獨立為 REGISTERED，新單先訂購，既有 ORDERED 保留叫貨語意。桌面共用單張 grid、StatusChip、備註與粗分隔、15 欄（含手機）、狀態篩選、下一步一致 SVG、逐列展開歷程。
- 全手動，沒有外部連動。日期 popover 預設今天／上次日期，儲存才推進；已登記可改不可清空，與系統事件時間分離。取貨為結案，日期更正不推進。退回只一步、必填理由、保留舊日期並標示已退回。通知提醒以台北作業日計算。
- 曾叫貨後（含退回訂購）修改內容必填類別／理由，其他必填補充；內容沒有變化不造事件。
- 新增／修改視窗：基本資料五欄，電話／手機／LINE 至少一項，共用 Field，單表含品項、加列、金額合計／訂金／尾款、備註；無獨立金額區。手機聯絡欄折行、清單適應觸控；品項輸入表窄畫面仍可橫捲。
- 黑名單處置正式文字「須全額預付」，增加 OTHER（只顯示理由供人工處理，不自動拒單／強制全額）。理由單行、顧客姓名與三選一聯絡資料。
- 顧客取消／其他：新對象問「是／否」，是開預填黑名單視窗，最後與取消原子提交；否只取消。既有對象顯示已在黑名單，追加訂購事件，不覆寫處置或原理由。手動黑名單允許 0 訂購事件。加重處置需人員操作與理由。
- 同電話／手機跨欄精確匹配，LINE 顯示名只能作候選，要求人工同人／不同人判斷，關閉則停止送出；多個號碼命中不同主檔時人員選事件對象。

## 2. 檔案與資料
| 檔案 | 修改 |
|---|---|
| migrations/0033_store_order_workflow.sql | 保留資料的 parent/child rebuild，新增聯絡、狀態、日期、曾叫貨及 legacy 欄；黑名單 active/version/OTHER；order_events 與 blacklist_events，來源訂購事件唯一。|
| shared/store.ts | 新狀態、聯絡、dates、理由類別、事件型別與正式處置名稱。|
| worker/http/store-routes.ts | server validation、相鄰流程／日期修改、三選一／候選核對、歷程分頁、版本／黑名單快照 guard、原子交易與 requestKey 去重。|
| src/runtime/modules/StorePage.tsx | 保留門市頁籤與盤點掛載，訂購抽至專用模組。|
| src/runtime/modules/StoreCustomerOrders.tsx | 新清單、表單、日期與理由視窗、黑名單預填／是／否／人工核對、歷程。|
| src/runtime/modules/store.css | 訂購專用 grid、日期 popover、桌面／手機與視窗尺寸，未修改盤點 CSS。|
| worker/backup/schema-columns.ts | 全部新增欄位／表登記，與 migration 對齊。|
| worker/backup/store-workflow-upgrade.ts | 明確釘選 pre/post-0033 migration chain schema 指紋（LF/CRLF），舊欄位。|
| worker/backup/portable-backup.ts | 僅精確 pre-0033 schema 備份可升級到對應空白新版 recovery target；先驗證原 bytes／scope，再映射，最後對升級後資料逐 byte reconciliation；不放寬其他舊 schema 或非空目標限制。|
| scripts/validate_schema.py | 新事件表納入 canonical schema coverage。|
| scripts/store-route.test.mjs | 更新舊流程驗收，新增日期／三選一／黑名單事件／分頁／重送／並發／交易失敗回滾。|
| scripts/store-page.test.mjs | 真實頁面 handler 驗收，controlled transport 與 React hook host，非瀏覽器截圖。|
| scripts/store-backup-upgrade.test.mjs | seeded legacy migration 與新／舊備份還原、安全守門。|
| VERSION / BUILD / package.json | V0.9.57 Build 0，新顧客訂購工作項目，不延續盤點 Build。|

## 3. API／安全重點
- /orders 新增及 PATCH 要 requestKey；更新帶 expectedVersion。/status 接 action=advance/rollback/cancel，拒絕舊任意 status 下拉跳階。日期更正 PATCH /orders/:id/date；GET history 分頁 20。
- 實際作業日 YYYY-MM-DD，今天上限、不得早於訂購／相鄰有效日期，UTC 操作時間另存事件。通知舊 timestamp 保留原值，新提醒使用 notified_date。
- 所有 routes 使用既有 STORE_CUSTOMER_ORDERS gate。操作者來自受權 session，主列表不載全歷程。
- batch 先檢查 order version 與 active blacklist 的 versioned snapshot，與資料、事件及 Audit 同批成功／回滾；新增 requestKey 有跨訂購 actor/key unique index，防同一請求競爭造兩張新單。
- 刪除黑名單改為移出（active=0），保留來源事件與訂購紀錄。重新手動建立會是新主檔；舊事件不刪除，若需「移出再加入仍合併事件」，需另外審核復用 inactive 主檔的識別規則。
- 輸入理由／個資只留受保護的業務表，Audit 保留事件摘要／必要處置變更，不寫一般 log。

## 4. 驗證證據
- npm run build：browser TypeScript、Worker TypeScript、Vite 全部通過（既有 bundle size／dynamic import warning）。
- 本輪 focused：store-route、store-page、store-backup-upgrade、form-keyboard、form-fields 共 28/28 通過。
- 門市＋盤點＋表單驗收於較早一輪 50/50 通過；後續修改局限於可及性、日期防呆及備份跨平台相容，會由 PR 全套再確認。
- 完整 Node 本機首次 454 項：446 pass／8 fail，失敗在未修改的 Windows 相容性測試（backup rehearsal 的 esbuild onLoad 路徑 regex、secure-entry 的 /C:/ URL pathname、deployment-source 的 LF split）。不改動這些無關流程或跳過其遠端檢查；Linux CI 結果以 PR run 為準。
- git diff --check 通過。
- Python 本機未安裝，schema／source Python 驗證待 Linux CI；本機已有以 Node SQLite 套用完整 migration、外鍵檢查及 seed 資料保留測試。

## 5. 明確未完成／Claude 檢查
- 使用者同意瀏覽器後，Edge 獲准開啟，但 Computer Use 因無法可靠判斷當前 URL 自動停止本輪操作，未改用其他途徑繞過。因此**沒有實際瀏覽器視覺／點擊驗收證據**，合成 UI server 已停止；真實桌面／手機／日期選擇器的 focus、裁切、長字內容、單列展開需人工確認。
- production D1 migration、正式登入、正式訂單／黑名單與外部模組皆未操作；沒有任何網站部署。
- Claude 需複審 0033 重建與 foreign keys／backup 指紋匹配、低頻大黑名單 snapshot guard 的成本、並發、LINE 人工判別、取貨／退回／日期更正與 7 日提醒、inactive 黑名單保存策略、表單與手機實機。
- Claude 結論：待審；不能以 GPT 測試通過代填最終審查通過。

## 6. 遠端最終驗證（實作 source fe4d1d0）
- Runtime Check run [41092241136](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41092241136)：browser-typecheck、worker-typecheck、source-contracts、build 全部通過；完整 Node suite **460/460，0 fail**。包括本機受 Windows 路徑／CRLF 影響的驗收，在 Linux 全部通過。
- Governance Check run [41092241099](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41092241099)：通過。
- Deployment contract run [41092241049](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41092241049)：validate-deployment-contract 通過，正式 deploy／audit jobs 按 PR 規則跳過，沒有部署或正式資源操作。
- PR [#324](https://github.com/simonliu1118-byte/chihyuan-web/pull/324) 保持 Draft。此次追加僅交接文件，功能 source 未再改動；CI 證據以明列 source 與 run 為準。
- 實際瀏覽器／真實裝置驗收與 Claude 最終審查仍待完成，不將 460/460 誤稱為正式使用驗收。
