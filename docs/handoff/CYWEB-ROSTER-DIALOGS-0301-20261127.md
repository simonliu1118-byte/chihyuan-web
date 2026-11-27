# CYWEB V0.30.1 排班格與門市人員設定
- 基準 main 42b520ed113de94a8f114d5e27e9b5635c2afbe4；版本 0.30.1，Build 0；不合併、不部署。
- HrRosterPanel：排班格改全寬分組、選擇狀態與套用；門市人員設定改 medium、手把、select 與共用 Dialog footer。保留職稱分組（BD-060）；拖曳／方向鍵只在同職稱內移動；批次保存後更新 server roster，不清除 changes、notes、rules 草稿。
- ReorderHandle：抽出既有 LookupSettingsTable 的手把圖示與 CSS，原 lookup 行為不變；新增門市排序的桌機拖曳與觸控放開定位。
- HrRosterService：PATCH staff 改為 staff 陣列，一次預查門市人員、驗證成員與重複項、D1 batch 寫入與逐人 audit；無 schema migration。更新前端唯一已知呼叫。部署仍須同版前後端。
- hr-phase2a-acceptance：新增批次寫入、無效成員不部分寫入驗證；版本／CHANGELOG 更新。
- 選擇「套用」僅更新本月草稿，仍須儲存本月才正式寫入。非排班兼職及休假規則不改。
- 待驗：遠端 CI、桌機與手機視覺／拖曳、實際操作、Claude 審查；本對話未能啟動本地工作環境，不能宣稱測試已通過。
- Claude 審查：待填。
