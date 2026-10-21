# Roadmap

目標：KDAN 自己的三個市場（台灣、美國、日本）先用起來，接著讓第一個外部客戶 Bandai
自助開通使用。產品照 devflow console 的方式做成即插即用：帳號連線與設定都在網頁上完成，
不為單一客戶客製或部署。

## 已決定

| 項目 | 決定 |
|---|---|
| 開發 | Bennett ＋ Claude |
| 部署 | 開發與 KDAN 內部試用用 Vercel Hobby ＋ Supabase（東京）；**Bandai 正式使用前升級 Vercel Pro**（Hobby 只限非商業用途）。核心邏輯不綁 Vercel，之後可搬 GCP。步驟見 [deploy.md](deploy.md) |
| 資料庫 | Supabase Postgres；app 走 transaction pooler，migration 走 session／direct 連線 |
| 程式碼 | GitHub 私人 repo `R09722akaBennett/kdan-social` |
| 技術棧 | TypeScript；Next.js（`apps/web`）＋框架無關的核心套件（`packages/core`）；PostgreSQL；Drizzle |
| 排程 | Supabase Cron 每分鐘呼叫派送端點（Hobby 的 Vercel Cron 一天只能一次），從資料庫撈到期任務發送，資料庫是唯一的事實來源。FB 也走自己的排程，不用 `scheduled_publish_time`，三個平台的失敗處理與 dry-run 才能一致 |
| 對外寫入 | 全站總開關＋每個工作區開關，**預設關閉**；關閉時只記錄 `[dry-run]`，不呼叫平台 |
| 網域 | 先用 `*.vercel.app`，送 App Review 前換成公司網域 |

## 階段 1 — 基礎與 KDAN 自用（第 1–3 週）

不需 Meta 審核，app 維持開發模式。

- [x] 建立 Meta app（用途：Manage everything on your Page、Manage messaging & content on Instagram），App ID `1582239959893232`
- [x] 驗證發文：用測試粉專 Datalemak 經由正式排程實際發出一則文字貼文（2026-10-20）
- [x] 正式 OAuth 流程（不要寫死 token；這段畫面之後就是 App Review 的錄影素材）
- [x] 資料模型：工作區 → 帳號群組（客戶自己命名，選填）→ 已連結帳號（各自有時區）→ 貼文 → 每個帳號一個版本 → 發文任務
- [x] Token 加密存放於後端
- [x] Token 失效偵測（發文與每日快照時）與重新連結（重新授權即更新 token）
- [x] 發文編輯器：FB 粉專（文字、圖片）→ IG（圖片、輪播）、圖片上傳、依各帳號時區排程
- [x] 每日粉絲數快照
- [x] 登入與工作區：Email＋密碼，註冊不寄驗證信（跟 Buffer 一樣）；新工作區用 `SIGNUP_CODES` 邀請碼自助建立。Facebook 只用來連結粉專，不再用來登入
- [x] 帳號群組與帳號時區的設定畫面
- [x] 成員邀請：每個邀請一條只能用一次的連結（目前不寄信，複製連結傳給對方）。註冊不驗證 Email，所以不能靠 Email 比對自動加入
- [x] 部署到 Vercel（https://kdan-social.vercel.app，Supabase Cron 每分鐘觸發派送）
- [ ] 錄 App Review 操作影片並送審

## 階段 2 — KDAN 三市場全面使用（第 4–7 週）

- [x] LINE 官方帳號串接（客戶貼 channel 憑證），台灣與日本
- [x] 行事曆、審核流程、通知
- [x] AI 改寫、依帳號改寫、品牌語氣（含試寫）、禁用詞檢查
- [x] onboarding：歡迎頁、問卷、功能導覽，以及總覽的設定步驟卡

## 階段 3 — Bandai 開通（第 8–10 週起）

- [x] 成效頁：粉絲數走勢、每篇互動（FB／IG／LINE）、AI 分析
- [ ] 觸及人數與推薦時段已完成（觸及需 `read_insights`、`instagram_manage_insights`，App Review 時一起申請）；還差 AI 週報
- [ ] 成員與角色已完成；操作紀錄有寫入 `audit_log`，還沒有查看的頁面
- [ ] Meta 商業驗證（用 KDAN 公司實體）
- [ ] App Review：各權限 Advanced Access、操作錄影、隱私權政策、資料刪除說明
- [ ] App 切換為 Live。審核通過前，Bandai 要授權的人須先被加為 app 測試者
- [ ] 重設 Supabase 資料庫密碼（目前這組曾在對話中外洩），並同步更新 Vercel 的 `DATABASE_URL`

## Buffer 對齊

依 Buffer 的實際操作錄影與 Mobbin 上的畫面整理，分批做。

- [x] 第 1 批：Email 登入、邀請連結、首頁改版、浮出式提示、載入骨架、側欄前端換頁、連結帳號視窗
- [ ] 第 2 批：帳號頁四個分頁（排程／草稿／待審核／已發送）、歡迎卡與草稿已完成；還差 IG 用 Instagram 登入直接連結（要先在 Meta app 加「Instagram API with Instagram Login」）
- [x] 第 3 批：點子看板、範本庫、編輯器補強（第一則留言、再建立一篇）
- [x] 第 4 批：每個帳號的成效、單篇貼文的數字、IG 格狀檢視、標籤
- [ ] 第 5 批：發文目標與推薦時段、留言收件匣、Feeds、Reel／限時動態已完成；寄信服務（Resend SMTP，讓忘記密碼的信寄得到客戶）的步驟寫在 [deploy.md](deploy.md)，還要選一個能改 DNS 的網域並完成設定

## 待確認

- Meta app 先建在 Bennett 的商業帳號，送審前移到 KDAN 的商業帳號（轉移核准後不可撤回，必須在驗證前完成）
- LINE 一鍵授權（合作夥伴計畫）是否值得申請
- Graph API 版本：程式先用 v25.0，接真實 API 時對照最新版本
