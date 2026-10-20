# 部署（Vercel Hobby ＋ Supabase）

開發與 KDAN 內部試用階段用免費方案。**Bandai 正式使用前要升級 Vercel Pro**：Hobby 只限個人、
非商業用途，受薪員工開發、為公司營利的部署都算商業用途。

## 排程由誰觸發

| 工作 | 頻率 | 觸發者 | 為什麼 |
|---|---|---|---|
| 派送發文 `/api/cron/dispatch` | 每分鐘 | Supabase Cron（pg_cron ＋ pg_net） | Vercel Hobby 的 Cron 一天只能跑一次，且只保證在指定的那一小時內 |
| 粉絲快照 `/api/cron/snapshot` | 每天 00:30 台北時間 | Vercel Cron（`apps/web/vercel.json`） | 一天一次，Hobby 就夠；晚個幾十分鐘不影響 |

兩個端點都只接受 `Authorization: Bearer <CRON_SECRET>`；`CRON_SECRET` 沒設時一律拒絕。

## 1. Supabase

1. 建專案。目前的專案（`pfpxjjgzrbddmkkerjlj`）在 **Singapore（ap-southeast-1）**，Vercel 函式區域
   也設成 `sin1` 和它同區；兩者不同區時，每次查詢都要多跑一趟跨國往返。
   所有資料表都開了 RLS 且不設 policy（migration `0002_enable_rls`）：Supabase 會把 `public`
   的表透過 Data API 開放給持有 publishable key 的人，RLS 讓那條路什麼都拿不到；
   app 用資料庫擁有者帳號直連，不受影響。新增資料表時要一起開，`test/schema.test.ts` 會檢查。
2. 到 Project Settings → Database 取兩組連線字串：
   - **Transaction pooler（port 6543）**：給 Vercel 上的 app 用，設成 Vercel 的 `DATABASE_URL`。
     serverless 每次呼叫都可能開新連線，直連很快就會用完連線數。
   - **Session pooler 或 Direct（port 5432）**：只給本機跑 migration 用，不放進 Vercel。
3. 本機跑 migration：

   ```bash
   DATABASE_URL='<session 或 direct 連線字串>' pnpm --filter @kdan-social/core db:migrate
   ```

## 2. Vercel

1. 匯入 GitHub 的 `kdan-social`，**Root Directory 設 `apps/web`**（`prototype/` 是另一個專案，不要動它）。
2. 環境變數：

   | 變數 | 值 |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler 連線字串 |
   | `KDAN_SOCIAL_SECRET_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 產生；換掉會讓所有帳號都要重新連結 |
   | `CRON_SECRET` | 隨機長字串，同一個值也要放進 Supabase Vault（下一步） |
   | `PUBLISHING_ENABLED` | `0`。確認流程都沒問題後才改成 `1` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co`（公開值） |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 的 publishable key（公開值，靠 RLS 保護資料） |
   | `SUPABASE_SECRET_KEY` | Supabase 的 secret key，只用來簽圖片上傳網址；會繞過 RLS，只能放在伺服器端 |
   | `META_APP_ID` | Meta app 的 App ID |
   | `META_APP_SECRET` | Meta app 的 App Secret |
   | `AI_MODEL` | AI 寫文案用的模型，格式 `vertex/<模型>`：例如 `vertex/gemini-3.8-flash`、`vertex/claude-opus-5-5`、`vertex/xai/grok-4`（以 GCP Model Garden 實際開放的 ID 為準）。沒設時 AI 按鈕不會出現，其他功能照常 |
   | `AI_MODEL_INSIGHTS` | 選填：成效頁「AI 分析」改用別的模型，例如 `vertex/gemini-4-argon`；沒設就用 `AI_MODEL` |
   | `GCP_PROJECT_ID` | 開了 Vertex AI 的 GCP 專案 ID |
   | `GCP_LOCATION` | Vertex 區域，預設 `global`；有些合作夥伴模型只在特定區域（例如 `us-east5`） |
   | `GCP_SERVICE_ACCOUNT_JSON` | 有 `Vertex AI User` 角色的 service account 金鑰（整份 JSON）。只放在 Vercel 環境變數，不進版本控制 |

3. Function 區域設成和 Supabase 同區（目前是 `sin1`）。

## 圖片儲存

Supabase Storage 的 `media` bucket：公開讀取（Instagram 從公開網址抓圖），單檔上限 8 MB，
只收 `image/jpeg`（Instagram 只接受 JPEG，瀏覽器上傳前會先轉檔）。

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/jpeg']);
```

上傳流程：伺服器用 secret key 簽一次性的上傳網址（路徑 `<workspace id>/<uuid>.jpg`），瀏覽器直接
傳到 Storage，不經過 Vercel（函式有請求大小上限）。沒有簽名的上傳、重用過的網址、非 JPEG 都會被拒絕。

## 登入與 Meta 授權

- **Supabase Auth**：Site URL 設正式網址；Redirect URLs 加 `<正式網址>/auth/callback`
  與 `http://localhost:3000/auth/callback`。登入用 Email 連結，免費方案每小時能寄的信很少，
  內部使用足夠。
- **新成員**：登入一次後還不屬於任何工作區，要由管理員加入（目前用資料庫腳本）。
- **Meta app**：兩個用途「Manage everything on your Page」與「Manage messaging & content on
  Instagram（API setup with Facebook Login）」，權限要包含 `META_SCOPES`
  （`packages/core/src/platforms/meta-oauth.ts`）列出的每一項；Facebook Login for Business 的
  Valid OAuth Redirect URIs 填 `<正式網址>/api/meta/callback`。app 在開發模式時，只有在 app
  有角色的人能授權。

## 3. Supabase Cron 每分鐘呼叫派送

在 Supabase 的 Database → Extensions 啟用 `pg_cron` 與 `pg_net`，然後在 SQL Editor 執行
（把兩個值換成實際的網址與 `CRON_SECRET`）：

```sql
select vault.create_secret('https://<你的 app>.vercel.app', 'kdan_social_url');
select vault.create_secret('<CRON_SECRET>', 'kdan_social_cron_secret');

select cron.schedule(
  'kdan-social-dispatch',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'kdan_social_url') || '/api/cron/dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kdan_social_cron_secret')
    ),
    -- pg_net gives up after 5 s by default; a dispatch that publishes several posts takes longer.
    timeout_milliseconds := 60000
  );
  $$
);
```

自我檢查：

```sql
-- 最近 10 次排程有沒有跑、成功與否
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- 呼叫我們端點的 HTTP 結果（200 與 JSON 摘要才算正常；401 代表 CRON_SECRET 兩邊不一致）
select status_code, content, created from net._http_response order by created desc limit 10;
```

暫停：`select cron.unschedule('kdan-social-dispatch');`

## LINE

- 客戶在 `/app/connect/line` 貼上 Messaging API channel 的 Channel ID 與 Channel secret；
  保存前會用它們換一次 token 並讀官方帳號名稱，錯的不會存。不需要 webhook。
- 發文是 broadcast：推播給**全部好友**，每位收到的好友扣 1 則額度（不論訊息有幾段）。
  驗證真實發送一定要用**只有自己是好友的測試官方帳號**，不要用正式帳號。
- 額度用完時 LINE 回 429，系統直接標為失敗、不重試（要到下個月才會恢復）。

## 注意

- pg_cron 不會補跑也不會重試；漏掉的那分鐘，任務會在下一分鐘被撈到，所以不影響正確性，只會晚一分鐘。
- Supabase 免費專案閒置一週會被暫停，暫停後排程也跟著停。每分鐘的派送本身就會查資料庫，
  一般不會被判定為閒置，但上線初期要留意專案狀態。
