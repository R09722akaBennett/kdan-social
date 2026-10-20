# Roadmap

目標：KDAN 自己的三個市場（台灣、美國、日本）先用起來，接著讓第一個外部客戶 Bandai
自助開通使用。產品照 devflow console 的方式做成即插即用：帳號連線與設定都在網頁上完成，
不為單一客戶客製或部署。

## 已決定

| 項目 | 決定 |
|---|---|
| 開發 | Bennett ＋ Claude |
| 部署 | 先用 Vercel（Pro 方案，Hobby 不能商用、Cron 只能每天一次）；核心邏輯不綁 Vercel，之後可搬 GCP |
| 程式碼 | GitHub 私人 repo `R09722akaBennett/kdan-social` |
| 技術棧 | TypeScript；Next.js（`apps/web`）＋框架無關的核心套件（`packages/core`）；PostgreSQL；Drizzle |
| 排程 | 每分鐘一次的 Cron 從資料庫撈到期任務發送，資料庫是唯一的事實來源。FB 也走自己的排程，不用 `scheduled_publish_time`，三個平台的失敗處理與 dry-run 才能一致 |
| 對外寫入 | 全站總開關＋每個工作區開關，**預設關閉**；關閉時只記錄 `[dry-run]`，不呼叫平台 |
| 網域 | 先用 `*.vercel.app`，送 App Review 前換成公司網域 |

## 階段 1 — 基礎與 KDAN 自用（第 1–3 週）

不需 Meta 審核，app 維持開發模式。

- [ ] 建立 Meta app（Business 類型），加入 Facebook Login for Business、Pages、Instagram 相關產品
- [ ] 用 Graph API Explorer 取得 page token，手動驗證發文與讀取粉絲數
- [ ] 正式 OAuth 流程（不要寫死 token；這段畫面之後就是 App Review 的錄影素材）
- [x] 資料模型：工作區 → 市場 → 已連結帳號 → 貼文 → 市場 × 平台版本 → 發文任務
- [x] Token 加密存放於後端
- [ ] Token 失效偵測與重新連結
- [ ] 發文：FB 粉專（文字、圖片）→ IG（圖片、輪播）
- [ ] 每日粉絲數快照
- [ ] 登入與工作區、市場設定
- [ ] 部署到 Vercel staging
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

## 待確認

- Meta app 先建在 Bennett 的商業帳號，送審前移到 KDAN 的商業帳號（轉移核准後不可撤回，必須在驗證前完成）
- LINE 一鍵授權（合作夥伴計畫）是否值得申請
- Graph API 版本：程式先用 v25.0，接真實 API 時對照最新版本
