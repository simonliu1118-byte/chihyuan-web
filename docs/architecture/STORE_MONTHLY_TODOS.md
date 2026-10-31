# 門市月度待辦 V0.9.58 契約

本功能使用既有 React → protected Worker API → D1；目前發布進度由根 TODO 維護。

## 畫面與操作

- 門市第三頁籤「月度待辦」。使用共用表格，年月 YYYY/MM、門市別、粗直線、動態項目欄、粗直線、操作欄；年月新到舊，同月依門市設定排序。
- 每個年月／門市一列，每個適用項目獨立確認辦理。未辦理為圖示按鈕，已辦理顯示 MM/DD；勾「無日期」則顯示勾號，不捏造日期。不適用的格子斜線劃掉。
- 小日期視窗的日期欄收窄，可更正日期或改成無日期；「取消完成」另經確認。各格版本獨立，操作紀錄可逐列展開，以共用門市歷程元件顯示。
- 桌面固定年月、門市、操作；手機保留年月與操作，其他欄位在表格內橫捲，避免固定欄占滿螢幕。
- 設定門市／設定項目沿用共用可編輯表格，支援排序、啟停、項目適用門市複選；不設定項目數量上限。已儲存設定不能刪除，使用停用保留歷史。

## 權限

`STORE_MONTHLY_TODOS` 是獨立的一般模組存取權；有權限者可查詢、辦理、更正、取消完成與閱讀該列歷程。不另設「設定權限」。只有 CYID workspace role `ADMIN`／`SUPER_ADMIN` 可以設定門市與項目；Worker 在讀取設定請求內容之前檢查角色，隱藏按鈕不作為授權依據。Super Admin 沿用全部模組可用規則，不替其他員工自動配發新權限。

## 生效月份與自動產生

- 時區 Asia/Taipei。啟用、新增門市／項目／適用門市當月立即生效；不回填較舊年月。不適用或尚未新增的歷史格顯示斜線。
- 停用門市、停用項目、取消適用門市從次月生效；當月與過去的格子及完成狀態保留。重新啟用從當月生效，中斷月份不補造待辦。
- 設定 JSON 保存 `{from, until?}` 月份區間，`until` 為不包含的結束月份。門市名稱與排序更新當月快照，舊月份保留原門市名稱；項目欄頭使用目前名稱，事件保存當時項目名稱。
- UTC `0 16 * * *`（台灣每日 00:00）使用現有 Worker scheduled handler，與自動備份啟停無關。每月一日產生新月，其他日可補漏；授權讀取頁面也使用同一補漏邏輯。
- 以設定版本、最後產生年月、唯一 `(month,store_id)`／`(row_id,item_id)` 和單一 D1 batch 防止重複／競爭。只新增缺少的列與格，不覆寫既有完成狀態。新設定同一 batch 補齊當月，不回填過去月份。

## 資料與 API

Forward migration：`0034_store_monthly.sql`，擴充既有 Module Access CHECK 並保留既有授權；新增 `store_monthly_settings`、`store_monthly_rows`、`store_monthly_cells`、`store_monthly_events` 四表，無預設門市／項目。

根路徑 `/api/business/store/monthly`：

| 方法／路徑 | 行為 |
| --- | --- |
| GET `/`，可帶 `before=YYYY-MM` | 每頁十二個月份、完整設定、角色投影、下頁月份 |
| POST `/settings/stores`、`/settings/items` | `expectedVersion`、UUID `requestKey`、完整設定清單；管理員以上 |
| PATCH `/rows/:rowId/cells/:itemId` | `expectedVersion`、UUID `requestKey`、`completed`、明確的 `completionDate`（有效日期或 null） |
| GET `/rows/:rowId/history?cursor=id` | 最新事件優先，每頁二十筆 |

日期不能晚於台灣今天；未完成的格不可帶日期。不存在的格回 404，過期版本回 409；相同 actor／requestKey／payload 重送返回成功，不重複記事件；同 key 不同內容回 409。業務事件、資料修改、共用 Audit 在單一 D1 batch 原子提交。

傳輸大小上限 1 MiB、設定 JSON 合計 800 KB，避免超過 D1 單列及事件快照限制；這是資源保護，不是項目數量上限。批次產生使用 JSON joins，不為每個項目增加綁定參數。

四表均納入可攜備份與空白目標還原。僅精確識別的 pre-0033／pre-0034 schema 允許升級，新增月度四表為空；未知 schema、非空目標仍拒絕。日期、無日期完成、版本與事件均應往返保留。
