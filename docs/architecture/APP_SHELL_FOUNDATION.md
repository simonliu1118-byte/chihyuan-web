# CY Web App Shell Foundation

> Current authenticated operational shell; final visual dimensions remain subject to UI/UX acceptance.

## Shared responsibilities

One `AppShell` owns the brand, navigation, active module, account controls, main-content boundary and responsive framing. Modules provide domain content and actions; Desktop/Tablet/Mobile share the navigation model and permission semantics.

Navigation items carry a stable key, label and href. The runtime filters business items through Employee Module Access and administrative items through existing Role rules. Identity and CY Programs remain available to valid sessions without business Module Access. The shell is presentation; it does not grant access.

## Module switching

`onNavigate` delegates ordinary same-tab activation to the runtime's guarded hash transition. Modified clicks retain native new-tab behavior; disabled items cannot activate. The skip link only focuses main content and never changes the module hash.

The active editor remains mounted while the shared switch dialog asks once:

- **確定切換**: discard unsaved local edits and enter the selected module.
- **放棄切換，繼續編輯**: remain in the original module with the fields intact.

There is no mandatory save, automatic save, extra recovery draft or second discard prompt. Hash/Back cancellation replaces the current address without adding a history entry. Repeated attempts do not create another pending transition. Permission enforcement invalidates pending navigation and returns to Identity independently of discard consent.

`useUnsavedChangesGuard` registers editor/busy state with `UnsavedChangesBoundary`; the existing shared `ConfirmDialog` renders the decision. Navigation does not duplicate business state or API authority. See `OVERLAY_FEEDBACK_FOUNDATION.md` for form cancellation and busy behavior.

A destination business page mounts after its own module-access check, avoiding an initial mount authorized by the previous module's result.

## Visual and acceptance boundary

Shared layout/styles remain one codebase; no separate device router is introduced. Desktop browser checks and automated transition tests do not substitute for real Tablet/Mobile and multi-role acceptance. Current progress and remaining tests live only in root `TODO.md`.

## Confirmed colour direction — 2026-10-16

使用者已確認這組配色優於現況，採同一系列的兩種外觀：**石墨靛藍為深色版，霧白靛藍為淺色版**。目標是現代、簡潔、適合長時間操作的商務網頁系統。現行酒紅色只是 Web 暫定基礎配色，不能將它描述成 CY 系列品牌色；本次選色也不建立新的家族品牌規範。

以下為已檢視設計的色票，供後續沿用共用樣式時對照；不代表已套入正式程式。

| 用途 | 淺色：霧白靛藍 | 深色：石墨靛藍 |
| --- | --- | --- |
| 網頁背景 | `#F6F6F9` | `#17171F` |
| 內容／表單表面 | `#FFFFFF` | `#23232F` |
| 主要文字 | `#282A3A` | `#EFEDF8` |
| 次要文字 | `#676B7E` | `#B6B4CB` |
| 邊界 | `#E3E3EC` | `#414052` |
| 主要按鈕／操作重點 | `#5552CD` | `#B6ADFF` |
| 主要按鈕文字 | `#FFFFFF` | `#2B2454` |
| 選取區底色 | `#EEEDFA` | `#36304E` |

兩版保持相同功能、操作及權限語意，以留白、文字層次、細分隔及少量重點色呈現。超級管理員金色／一般管理員銅色仍保留角色辨識，成功／警告／錯誤仍保留各自狀態語意，不一律改成靛藍。

可編輯設計預覽保存在 [深淺配色預覽 source](../design/cyweb-indigo-light-dark.html)，為對話預覽用 HTML fragment，使用合成資料；需搭配原 visualize renderer，並非部署頁面或可直接匯入產品的元件。既有本機預覽仍位於本對話的 visualization 目錄。

**版型與設計系統（0.9.0，待使用者驗收）。** 依使用者 2026-10-17 同意的提案（可收合側欄方向、桌機控制項 32px、內文 14px）與「字太小、元件太大、流程要順」的回饋實作：

- 單一樣式路徑：`src/app.css`（token、殼層、共用元件、清單／明細版型）＋ `src/ui/forms.css`（表單）；模組樣式只放該模組特有的排列，只用 token。先前 `readability.css`、`operational.css`、`compact-business.css` 三層覆寫已移除。
- 字級：內文 14px、次要 13px、最小 12px；桌機控制項 32px，觸控裝置或 ≤820px 自動 44px，輸入框 16px 避免 iOS 放大。
- 外觀：預設跟隨系統，可在側欄底部改「系統／淺色／深色」；偏好存在非敏感 cookie（不使用 localStorage）。登入頁提供同一設定的單鍵切換。
- 殼層：頁名、說明 ⓘ 與模組主要操作（例如「＋ 新增客戶」）在同一列頂欄；帳號、角色與登出移到側欄底部，手機在選單抽屜底部。
- 清單／明細：客戶、商品、瑕疵、銷售工單、委外、工作日誌共用 `cy-md` 版型。桌機與平板左右並排；手機一次只顯示一個窗格，點一筆才開明細，左上「‹ 清單」返回，自動選第一筆不會把手機清單蓋掉。
- 編輯：取消／儲存只出現一次，固定在編輯區底部；按鈕寫明結果（建立客戶／儲存修改）。工作流程按鈕（開始處理、ERP 回填、確認出庫、送出審核等）移到明細標題列，工單、委外、日誌加上進度條。

