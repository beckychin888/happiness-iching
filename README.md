# 幸福力學院｜易經六十四卦抽卡網站（第一版）

本專案包含 64 卦核對後的文字、Cloudflare Pages 前台、Pages Function、D1 資料庫結構、選用的 Resend 寄信與 MailerLite 訂閱串接。

## 部署步驟

1. 建立 Cloudflare Pages 專案（建議 Git 連線），將本資料夾上傳到 Git 儲存庫。Build command 留空，Build output directory 設為 `public`，Functions 目錄位於專案根目錄。
2. 在 Cloudflare D1 建立 `iching_oracle_db`，執行 `sql/schema.sql`。
3. Pages 專案 Settings → Bindings → D1 database，Variable name 設 `DB`，選擇新建資料庫，重新部署。
4. 在 Resend 驗證你擁有的寄件網域；Pages Secrets 設 `RESEND_API_KEY`，一般環境變數 `EMAIL_FROM` 設為經驗證的寄件地址。
5. 在 MailerLite 建立「易經每日能量抽卡」群組與自訂欄位 `source`、`last_hexagram`；Pages Secrets 設 `MAILERLITE_API_KEY`，環境變數 `MAILERLITE_GROUP_ID` 設為該群組 ID。
6. 部署後以測試信箱確認：抽卡、D1 紀錄、收到卦象郵件、同意/不同意訂閱時 MailerLite 的不同結果。

## 上線前必做（目前是技術原型，請勿直接公開蒐集真實個資）

- 加入正式隱私權政策、資料控制者資訊、刪除與聯絡方式，將 `draft-v1` 換成正式政策版本。
- 加入 Cloudflare Turnstile，並在 Pages Function 後端驗證 token；加入限流及濫用防護。
- 加入 Email 所有權驗證及安全的跨裝置識別，避免他人代填第三方信箱。
- MailerLite 訂閱流程應依帳號設定實作 double opt-in；檢查既有退訂狀態，不能重新訂閱已退訂者。
- 寄送 API 回傳成功只代表服務商接受請求，不等於信件已送達；建議加 webhook、重試佇列、退信處理。
- 目前按每次點擊隨機抽卡，尚未實作「每人每日固定一卦」；正式上線需加入伺服器端規則。
- 前台的卦象 JSON 是公開資料；不要將任何 API Key 放入 `public`。

## 目前的行為

- 使用者先看到卦象簡介，輸入 Email 後才看到完整解析。
- 沒設定 Resend 時仍會寫入 D1 並解鎖解析，但會告知郵件未寄出。
- 只有勾選行銷訂閱者才會呼叫 MailerLite API。
- 精油與幸福行動卡都未加入。
