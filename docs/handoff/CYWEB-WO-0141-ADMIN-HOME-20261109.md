# CYWEB WO-0.14.1 — 批次 6 系統管理／首頁

2026-11-09，分支 `cyweb/wo-0.14.1-admin-home`，父分支 `cyweb/wo-0.14.1-hr-erp-bot`。stacked Draft PR，使用者要求不合併／不部署。

## 變更與 owner
- `SharedIdentityPage.tsx`：僅手機主頁分頁 ModuleSections，UserWorkspace 搜尋／帳號狀態 DataViewToolbar、個人列 ListRow 仍呼叫 setDrawerId 開啟原 UserDrawer；GroupWorkspace 矩陣原資料與 checkbox onChange/toggle 不變，以 cy-rt、data-label 呈現，並在 shared mobile.css 保留 820px 下可點選的權限格，避免舊 @media 隱藏。桌機保留原表格、原 tabs 和按鈕。
- `AuditOperationalPage.tsx`：手機查詢改 DataViewToolbar，期間／模組／操作者的原 filters state 共用，關鍵字長度仍限制100；異動表 cy-rt，展開、追溯及權限遮罩不變。
- `BackupOperationalPage.tsx`：泛型 LineTable 在手機加 cy-rt、資料欄標籤與首欄重要性，沒有修改任何備份操作、驗證、還原、加密或個資流程。
- `HomePage.tsx`：手機待辦、公司公告、個人通知預覽 ListRow，原 onNavigate 目標與未讀/逾期資料不變；桌機原 JSX 保留。
- `ProgramCatalogPage.tsx` 原已使用共用 DataView（mobile renderCard／desktop table），`MyAccountPage` 原已是共用 Dialog＋FormSection；無需另建立第二個手機 owner。
- API／Worker／D1／CYID／session／權限一律不動。

## 待驗收
- Runtime、Governance、型別、Node suite 和 build：PR CI 需確認。
- 手機390×844／桌機1440px 修改前後截圖、登入後操作：尚未取得；如需審查請使用有權限的實測裝置／環境。
- Claude 最終複審：待。
- **不合併、不部署**。
