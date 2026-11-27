# CYWEB V0.30.1 排班格與門市人員設定
- 基準 main 42b520ed113de94a8f114d5e27e9b5635c2afbe4；版本 0.30.1，Build 0；原先不合併、不部署；使用者後續明確授權合併及正式部署，Claude 改為事後審查。
- HrRosterPanel：排班格改全寬分組、選擇狀態與套用；門市人員設定改 medium、手把、select 與共用 Dialog footer。保留職稱分組（BD-060）；拖曳／方向鍵只在同職稱內移動；批次保存後更新 server roster，不清除 changes、notes、rules 草稿。
- ReorderHandle：抽出既有 LookupSettingsTable 的手把圖示與 CSS，原 lookup 行為不變；新增門市排序的桌機拖曳與觸控放開定位。
- HrRosterService：PATCH staff 改為 staff 陣列，一次預查門市人員、驗證成員與重複項、D1 batch 寫入與逐人 audit；無 schema migration。更新前端唯一已知呼叫。部署仍須同版前後端。
- hr-phase2a-acceptance：新增批次寫入、無效成員不部分寫入驗證；版本／CHANGELOG 更新。
- 選擇「套用」僅更新本月草稿，仍須儲存本月才正式寫入。非排班兼職及休假規則不改。
- 待驗：遠端 CI、桌機與手機視覺／拖曳、實際操作、Claude 審查；本對話未能啟動本地工作環境，不能宣稱測試已通過。
- PR #560，程式提交 942084b0f93e9fc0151ec3da10d57b33514718c2。
- 驗證證據：[Runtime Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45982829757)、[Governance Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45982830206)、[Deployment Contract](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45982829580)。合併前仍須核對必要檢查成功；不得把尚在執行的工作視為通過。
- 事後審查重點：實際桌機／手機視窗寬度與版面、拖拉及方向鍵同職稱排序、取消不寫入、批次儲存失敗不清除草稿、班別及假別選擇與註記備註一併套用、既有假單流程、共用設定清單排序不退化。正式站健康檢查與實際使用者流程分開記錄。
- Claude 事後審查：待填，不預填通過。

## CI 返修
- [第一次完整回歸](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45982988580) 的唯一失敗為 `hr-personnel.test.mjs` 既有單人 staff PATCH 呼叫；舊版網頁也可能仍開啟。保留既有單人請求相容性，轉換為單一元素陣列，與新批次請求共用驗證／audit／D1 batch，不建立第二套流程。
- 既有單人回歸測試及新增批次驗收均保留，待本次 CI 結果。
