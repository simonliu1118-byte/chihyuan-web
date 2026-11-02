# V0.9.87 客戶頁資訊密度交接（2026-11-02）

- 使用者直接交辦與授權：客戶左清單比照叫貨單行、狀態靠右、無藍色、直線分隔；右側依實際資料欄位提高密度，保留三張卡片。統編放全稱右側、傳真與電話一起、地址獨立整列；完成可合併部署。不是 Claude 開立的工作單。Claude 最終複審待填，執行者不代簽。
- 分支 `cyweb/customer-density-0987`，基底 main `34fd0ed`（V0.9.86 單一排程），保留該正式修改。PR／最終 CI／部署證據待回填。

## 欄位核對及範圍

- 已核對 shared/customer.ts、shared/customer-related.ts、CustomerOperationalPage 編輯與檢視、customer-runtime-client、Customer repository 與 Quote list priceBreaks 投影。未以截圖推測欄位，也未讀取正式客戶資料。
- 主檔：編號／簡稱／全稱／統編／分類／地區／負責部門／負責業務／狀態／傳真；多筆電話含分機與備註，多筆地址含郵遞區號與備註，重要備註保留多筆。
- 聯絡人既有部門、職稱、電話、手機、備註完整列出，修正原 mobile ?? phone 只能看到一支的呈現；有效聯絡人篩選保持原規則。
- 拜訪摘要日期／對象／內容；報價使用既有快照與數量、單位、單價級距（前二級距與更多數量提示）；常用商品正式品號／品名／規格、或未建檔名稱／自訂分類。完整內容仍由既有查看全部視窗開啟，不增加摘要查詢。

## 修改檔案與 Owner

| 檔案 | 修改 |
| --- | --- |
| src/runtime/modules/CustomerOperationalPage.tsx | 單行左清單；統編接全稱；基本資料標籤值同行、負責部門；電話／傳真、全寬地址、共通表格聯絡人；三張既有 RelatedCard 增加實際欄位摘要。 |
| src/runtime/modules/customer-operational.css | 清單 36px、灰底、0 圓角、直線；客戶 workspace 限定密度樣式，移除卡片固定108px留白、縮小padding/gap；保留原字級；手機聯絡表以標籤值重排、無560px最小寬。 |
| VERSION/package.json、TODO、CHANGELOG、CUSTOMER_UI_COMPOSITION | 版本與最新客戶頁呈現同步。 |

- RelatedCard／共通 Info CSS 亦被商品與人事使用，因此沒有修改 RelatedCard 元件或全域密度；新增規則以 `.cy-customer-workspace` 限定。沿用現有 Web tokens、表格與共用元件；AITeam 尚無正式 Web canonical package，未另建視覺系統。
- 不增加 event listener、observer、storage、renderer、API、schema、migration 或 D1 query；四個既有載入 endpoint、刷新依賴、100筆上限及目前載入筆數語意不變，沒有為了卡片計數增加全表 COUNT。查詢／分頁既有限制不在本輪擴大。
- 新增／修改表單、權限、併發與寫入邏輯保持原流程；本輪為顯示修改。

## 驗證

- build/typecheck 與完整 npm run validate:source 通過；純 UI 可逆修改不增加鏡像測試，以實際 React 頁面合成驗收與既有完整 CI 驗證。
- 桌面1280：左清單實測36px、0圓角／灰底；三張卡片均在，兩筆摘要卡片高193.44px、一筆報價卡片138.06px（均無固定空白區）；地址可用858px，長地址使用整列；聯絡人同時顯示電話與手機，停用者不列。
- 手機390：聯絡表317px與容器317px一致，document無水平溢出；沿用清單／明細切換，三張卡片依序排列。缺資料／無編號客戶亦可查看，空值無破折號。
- 查看全部拜訪可開啟既有視窗。合成預覽直接打包正式元件、所有API由記憶體合成GET回應，寫入一律拒絕，沒有接觸正式D1／客戶資料。本輪實作驗收正式D1讀0寫0。
- 截圖位於 repo 外 `outputs/customer-density-0987.png`、`customer-density-0987-mobile.png`，全部合成資料，不放Public Git。驗收分頁已關閉、手機viewport已還原。
- CI與部署結果待回填；Claude複審待填。
