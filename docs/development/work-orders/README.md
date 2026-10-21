# CY Web 工作單

工作單是 `REPOSITORY_RULES.md` §11.4（本 repo `PROJECT_RULES.md` §9 指向它）的交接文件，**只有在使用者指示 Claude 開立工作單轉交 GPT 製作時才使用**：Claude 討論定案後撰寫 → 使用者轉交 GPT 執行並填「完成報告」→ Claude 審查。一個版本一張，檔名 `WO-<版本>.md`（例如 `WO-0.9.13.md`）。工作單描述需求與狀態，不是規則來源；規則仍以 `REPOSITORY_RULES.md`、`REPO_POLICY.md`、`PROJECT_RULES.md`、Business Decisions 為準。

## 格式

```markdown
# WO-<版本> <標題>

- 狀態：待執行 ／ 執行中 ／ 待審查 ／ 需修正 ／ 已完成
- 分支：cyweb/<名稱>　PR：#<編號>（執行者填）

## 1. 背景（使用者原話）
引用使用者的需求原文，說明要解決什麼問題。

## 2. 已定案事項
討論中已決定的做法與理由；相關 Business Decision（BD-xxx）。執行者不得更改。

## 3. 範圍
- 要做的項目（逐條）。

## 4. 不做
- 明確排除的項目，避免擴大範圍。

## 5. 實作指引
- 要用的共用元件／樣式／API、要改的檔案、步驟與注意事項。

## 6. 驗收清單
- [ ] 每一項都可具體檢查（畫面位置、行為、權限、資料）。
- [ ] 固定項目：新表單按 Enter 跳下一欄、日期欄位四碼年份（`PROJECT_RULES.md` §5，`form-keyboard.test.mjs` 會檢查）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。
- [ ] `node --test scripts/*.test.mjs` 通過（`audit-account-portal` 需 `.tmp/canonical-cyapps` 的 CYapps checkout）。
- [ ] VERSION／package.json 版本、TODO 段落已更新。

## 7. 截圖要求
- 列出要附的畫面（桌面 1440 寬、手機 390 寬；淺色／深色視需要）。

## 8. 完成報告（執行者填）
- 驗收清單逐項結果。
- 與工作單不同之處與原因。
- 驗證指令輸出摘要、截圖位置。

## 9. 審查紀錄（審查者填）
- 日期、結論（通過／需修正）、意見（依嚴重度排序）、審查者直接修正的小項目。
```
