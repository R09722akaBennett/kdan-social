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

1. 建專案，區域選 **Tokyo（ap-northeast-1）**，離台灣、日本都近。
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

3. Function 區域選 Tokyo（`hnd1`），和資料庫同區。

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

## 注意

- pg_cron 不會補跑也不會重試；漏掉的那分鐘，任務會在下一分鐘被撈到，所以不影響正確性，只會晚一分鐘。
- Supabase 免費專案閒置一週會被暫停，暫停後排程也跟著停。每分鐘的派送本身就會查資料庫，
  一般不會被判定為閒置，但上線初期要留意專案狀態。
