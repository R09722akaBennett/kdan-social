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
- [x] 資料模型：工作區 → 市場 → 已連結帳號 → 貼文 → 市場 × 平台版本 → 發文任務
- [x] Token 加密存放於後端
- [x] Token 失效偵測（發文與每日快照時）與重新連結（重新授權即更新 token）
- [ ] 發文編輯器：FB 粉專（文字、圖片）→ IG（圖片、輪播）、圖片上傳、各市場當地時間排程
- [ ] 每日粉絲數快照
- [x] 登入（Email 連結）與工作區；新工作區目前用 `workspace:bootstrap` 腳本建立
- [ ] 市場設定、成員邀請的畫面
- [x] 部署到 Vercel（https://kdan-social.vercel.app，Supabase Cron 每分鐘觸發派送）
- [ ] 錄 App Review 操作影片並送審

## 階段 2 — KDAN 三市場全面使用（第 4–7 週）

- [ ] LINE 官方帳號串接（客戶貼 channel 憑證），台灣與日本
- [ ] 行事曆、審核流程、通知
- [ ] AI 改寫、在地化、發布前檢查、品牌語氣
- [ ] onboarding

## 階段 3 — Bandai 開通（第 8–10 週起）

- [ ] 成效頁（FB 改用 views 系列指標）、AI 週報、推薦時段
- [ ] 成員與權限、操作紀錄
- [ ] Meta 商業驗證（用 KDAN 公司實體）
- [ ] App Review：各權限 Advanced Access、操作錄影、隱私權政策、資料刪除說明
- [ ] App 切換為 Live。審核通過前，Bandai 要授權的人須先被加為 app 測試者
- [ ] 重設 Supabase 資料庫密碼（目前這組曾在對話中外洩），並同步更新 Vercel 的 `DATABASE_URL`

## 待確認

- Meta app 先建在 Bennett 的商業帳號，送審前移到 KDAN 的商業帳號（轉移核准後不可撤回，必須在驗證前完成）
- LINE 一鍵授權（合作夥伴計畫）是否值得申請
- Graph API 版本：程式先用 v25.0，接真實 API 時對照最新版本
