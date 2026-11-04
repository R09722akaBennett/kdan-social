# 商用部署的選擇與單一客戶的 Meta token

這份文件給接手部署的同事和他的 AI 助理讀，內容不用先讀過程式碼也看得懂。目前的部署步驟在
[deploy.md](docs/deploy.md)，Meta app 審核在 [meta-app-review.md](docs/meta-app-review.md)。

> 價格、方案限制和 Meta 規則是 2026-11 查官方文件整理的，會變。動手前對照文末的來源。
> 標了「未證實」的項目，是查不到官方說法的，要自己實測。

## 先講結論

| 方案 | 運算 | 資料庫、登入、檔案 | 要改程式 | 適合 |
|---|---|---|---|---|
| A. 維持現狀並升級 | Vercel Pro | Supabase Pro | 不用 | 最快上線，不在乎跑在 GCP 以外 |
| B. 運算搬到 GCP（**建議先走這條**） | Cloud Run | Supabase Pro | 小：容器化、網址、排程 | 團隊習慣 GCP，想把服務、帳單、權限收進 GCP |
| C. 全部搬到 GCP | Cloud Run | Cloud SQL、Identity Platform、Cloud Storage | 大：登入、上傳要重寫 | 公司政策要求資料都在 GCP |

B 可以之後再演進成 C，兩步分開做，出問題比較好定位。

不管選哪個，Meta 這邊另外有兩條路，見下面的「Meta：多客戶 app 或單一客戶 token」。

## 程式綁了哪些平台

換平台前先知道動到哪裡。`packages/core` 只用標準 Postgres，不依賴 Vercel 和 Supabase；平台綁定都在
`apps/web`：

| 依賴 | 用在哪 | 位置 |
|---|---|---|
| Supabase Auth（Email＋密碼） | 登入、註冊、忘記密碼、每次換頁更新 session | `apps/web/proxy.ts`、`lib/supabase.ts`、`lib/auth.ts`、`app/login/actions.ts`、`app/auth/*`、`app/invite/[token]/page.tsx`；`packages/core/scripts/bootstrap-workspace.ts` 查 `auth.users` |
| Supabase Storage | 圖片、影片上傳（簽名網址，瀏覽器直傳）與公開讀取（IG 從公開網址抓檔） | `app/app/posts/actions.ts`、`app/app/posts/new/Composer.tsx` |
| Supabase pg_cron＋pg_net | 每分鐘呼叫 `/api/cron/dispatch` | 設定在資料庫裡，見 deploy.md |
| Supabase 的 RLS | 擋掉 Supabase Data API；不是 Supabase 時無作用也無害 | migration `0002_enable_rls.sql` |
| Vercel Cron | 每天呼叫 `/api/cron/snapshot` | `apps/web/vercel.json` |
| `VERCEL_PROJECT_PRODUCTION_URL` | 算出正式網址，Meta 的 redirect URI 要一字不差 | `apps/web/lib/server.ts` 的 `appUrl()` |
| `after()` | 連結粉專後，回應送出才匯入 60 天舊貼文 | `app/app/actions.ts` |
| `maxDuration = 300` | 排程端點最長跑 5 分鐘 | 兩個 `app/api/cron/*/route.ts` |

使用者 ID 只以 uuid 存在我們的資料表，沒有外鍵連到 `auth.users`，所以換登入系統不用改資料表結構，
但既有使用者要搬帳號（或請他們重新註冊）。

## 方案 A：Vercel Pro ＋ Supabase Pro

- **為什麼一定要升級**：Vercel Hobby 只限個人、非商業使用，公司營利的部署不行。Pro 每位開發者
  每月 US$20（只看不部署的成員免費），內含 US$20 用量額度。
- Pro 的 Cron 可以每分鐘跑、精度到分鐘，可以把派送排程從 Supabase pg_cron 搬回 `vercel.json`，
  少一個要維護的地方（選做）。函式最長預設 300 秒，可調到 800 秒。
- **Supabase Pro**：每月 US$25 起，含一台 Micro 的運算額度。免費方案閒置一週會暫停、沒有自動備份，
  商用不要留在免費方案。
- Supabase 只跑在 AWS，離台灣最近的是東京、首爾、新加坡，沒有台灣。目前用新加坡。
- 程式不用改，照 [deploy.md](docs/deploy.md) 換成公司帳號重建一次即可。

## 方案 B：Cloud Run ＋ Supabase Pro

網頁和排程端點跑在 Cloud Run，資料庫、登入、檔案留在 Supabase。

### 要改的程式

1. **容器化**：`apps/web/next.config.ts` 加 `output: 'standalone'`，寫一個 pnpm monorepo 的
   Dockerfile（要把 `packages/core` 一起帶進去，它是以 TypeScript 原始碼被 `transpilePackages` 編譯）。
2. **正式網址**：`appUrl()` 目前讀 Vercel 的 `VERCEL_PROJECT_PRODUCTION_URL`，沒有時退回請求的 origin。
   Cloud Run 前面有代理，請求看到的 host 不一定是對外網址，Meta 的 redirect URI 錯一個字就會授權失敗。
   改成先讀新的 `APP_URL`（例如 `https://social.kdan.com`），沒有再退回現有邏輯。
3. **Server Action 加密金鑰**：Cloud Run 會開多台 instance，每台要設同一個
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`，不然會出現「Failed to find Server Action」。
4. **`after()`**：Cloud Run 預設的計費模式只在處理請求時給 CPU，回應送出後 `after()` 裡的匯入會跑不動。
   二選一：服務改用 **instance-based billing**（CPU 常駐，費用較高），或接受連結後的舊貼文匯入延到
   當晚的快照排程才補上。
5. **Vertex AI**：在 GCP 上不用 `GCP_SERVICE_ACCOUNT_JSON`，給 Cloud Run 的 service account
   `Vertex AI User` 角色就好，程式會自動用 Application Default Credentials。少一把要保管的金鑰。

### 排程

用 Cloud Scheduler 取代 Vercel Cron 和 Supabase pg_cron（取代後記得 `cron.unschedule`，不然會兩邊都在叫）：

| Job | 排程 | 目標 |
|---|---|---|
| dispatch | `* * * * *` | `GET <APP_URL>/api/cron/dispatch` |
| snapshot | `30 0 * * *`，時區 Asia/Taipei | `GET <APP_URL>/api/cron/snapshot` |

- 兩個都加 header `Authorization: Bearer <CRON_SECRET>`，端點已經會檢查。服務本身是公開網站，
  所以用這個 header 驗證，不走 Cloud Run 的 OIDC 驗證。
- Cloud Run 的請求逾時設 300 秒以上（上限 3600 秒）；`maxDuration` 只對 Vercel 有效。
- 價格：每個 job 每月 US$0.10，每個帳單帳戶前 3 個免費，不按執行次數算。

### 其他設定

- 區域：Supabase 在新加坡，Cloud Run 也開在 `asia-southeast1`，避免每次查詢跨國往返。要用台灣
  `asia-east1` 的話，Supabase 也要考慮重開在離台灣近的區域，並實測延遲。
- `DATABASE_URL` 照舊用 Supabase 的 transaction pooler（port 6543）。
- 秘密值放 Secret Manager，掛成 Cloud Run 的環境變數。
- Meta app 的 Valid OAuth Redirect URIs、Supabase Auth 的 Site URL 與 Redirect URLs 都要換成新網址。

### Firebase App Hosting 可以嗎

它底下也是 Cloud Run，幫你處理建置和部署，也有台灣區域。但官方支援表目前只列到 Next.js 15，
我們用的是 16，屬於「預覽」支援。要用的話先在測試專案部署一次確認，不然直接用 Cloud Run 比較可控。

## 方案 C：全部 GCP

在方案 B 之上，把 Supabase 的三樣東西換掉：

| 換掉 | 換成 | 要做的事 |
|---|---|---|
| Supabase Postgres | Cloud SQL for PostgreSQL | 跑一次全部 migration；Cloud Run 透過 Unix socket `/cloudsql/<instance>` 連線。官方 Node connector 不支援我們用的 `postgres` 驅動，用 socket 直連即可。每台 instance 連線數要用 pool 控制 |
| Supabase Auth | Identity Platform（或 Firebase Auth） | 重寫上面「程式綁了哪些平台」表列的登入相關檔案；Session 改用它的 ID token 或 session cookie；`bootstrap-workspace.ts` 改查它的使用者；忘記密碼信的寄送與網址重新設定 |
| Supabase Storage | Cloud Storage | 上傳改成 V4 簽名網址（最長 7 天，瀏覽器直傳要設 bucket 的 CORS）；`media` bucket 給 `allUsers` 讀取權限，IG 要能從公開網址抓檔。公司組織政策若開了 public access prevention，要另外申請例外或改成 CDN |

- 價格參考：Cloud SQL 最小的共用核心機型在台灣區約每月 US$26（只算運算，第三方資料，官方價格頁沒查到）；
  共用核心可能不在 SLA 內，正式使用建議至少 1 vCPU 專屬核心。AlloyDB 起跳每月兩百多美元，這個規模不需要。
- Identity Platform 每月 5 萬 MAU 以下免費。Firebase Auth 免費方案每天只能寄 150 封重設密碼信。
- 工作量最大的是登入，建議先完成方案 B 穩定後再做。

## Meta：多客戶 app 或單一客戶 token

### 兩條路的差別

| | 多客戶 app（現在的設計） | 單一客戶 token |
|---|---|---|
| 誰擁有 Meta app | 我們（KDAN） | 客戶自己 |
| 客戶怎麼連結 | 網頁上按「連結帳號」走 Facebook 授權 | 管理員把 token 存進系統，客戶不用碰授權畫面 |
| 要不要 App Review | 要：商業驗證＋每個權限的 Advanced Access＋Tech Provider 存取驗證 | 不用，用 Standard Access |
| 適合 | 開放給很多客戶自助開通 | 一個客戶、短期內要上線、或審核還沒過 |

Meta 的規則重點：

- **Standard Access**：只能由在 app 上有角色（管理員、開發者、測試者）的人授權，不用審核。
  **Advanced Access**：任何人都能授權，但要商業驗證和 App Review。
- **開發模式**的 app 發出去的貼文**只有 app 角色看得到**，所以單一客戶也要把 app 切成 **Live**，
  只是不申請 Advanced Access。
- 我們的 app 要讓別家公司的粉專授權，在 Meta 的定義裡是 **Tech Provider**，發文和 IG 發布等權限
  除了 App Review 還要過存取驗證。客戶用自己的 app、我們只是代為操作的話，我們算 **Service Provider**：
  要有書面約定，資料只能為該客戶處理，合作結束要刪除。這是我們對 Platform Terms 的解讀，Meta 沒有明講。

### 單一客戶 token 怎麼做

程式本身不用改。每個帳號存的就是一把加密的 Page access token
（`connected_accounts.credentials` 的 `{ pageAccessToken }`），授權流程只是取得它的其中一種方法。
發文、成效、留言都只用這把 token，不用 `META_APP_ID` 和 `META_APP_SECRET`；這兩個只在網頁上的
「連結 Facebook」流程用到，單一客戶模式可以不設（那個按鈕會壞，不要讓客戶按）。

**1. 客戶那邊準備 app 和 token**（客戶的 Meta 商業帳號管理員做，或給我們權限代做）

1. 在客戶的商業帳號底下建一個 Business 類型的 Meta app，用途選「Manage everything on your Page」與
   「Manage messaging & content on Instagram」，切到 Live。
2. 二選一取得 token：
   - **System user（建議）**：商業設定 → 使用者 → 系統使用者，建一個，把粉專和 IG 帳號指派給它，
     把剛才的 app 加給它，產生 token 時勾選 `packages/core/src/platforms/meta-oauth.ts` 的 `META_SCOPES`
     列出的權限，有效期選「永不過期」。System user 和 app 必須在同一個商業帳號底下。
     不會因為某個員工離職或改密碼而失效。
   - **Graph API Explorer**：一個在 app 上有角色的粉專管理員，在 Explorer 選這個 app、勾權限、
     取得 user token，換成長效 user token（60 天）。用長效 user token 讀出來的 Page token 不會自己過期，
     但這個人改密碼、被移除粉專權限、離職時會失效。只適合試用。
3. 用 token 呼叫 `GET /me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`，
   拿到每個粉專自己的 Page access token 和綁定的 IG 帳號 ID。
4. 到 [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) 貼上 Page token，
   確認 Expires 是 Never、權限都在。

**未證實，要實測**：

- System user token 能不能直接打 `/me/accounts` 換 Page token、換出來的 Page token 效期多長，
  官方文件沒寫。業界做法是可以；以 Debugger 的結果為準。
- 產生 system user token 要不要先過商業驗證，官方文件寫「視情況」，沒講清楚。
- 粉專權限若是透過商業帳號給的，IG 發布可能還要 `ads_management`、`ads_read`。

**2. 存進我們的系統**

目前沒有現成的匯入工具，要寫一支腳本放在 `packages/core/scripts/`，做法跟
`bootstrap-workspace.ts` 一樣用 `DATABASE_URL` 直連，並且要讀 `KDAN_SOCIAL_SECRET_KEY`（和正式站同一把，
否則存進去的 token 解不開）。直接重用現有函式，不要自己寫加密或 insert：

```ts
// pages: MetaPage[]，即上一步 /me/accounts 的結果：{ id, name, token, instagram: { id, username } | null }
const sessionId = await startMetaConnect(db, loadKey(), { workspaceId, userId, pages });
await completeMetaConnect(db, loadKey(), {
  sessionId, workspaceId, userId, actor: '<操作者 email>',
  selections: pages.map((p) => ({ pageId: p.id, instagram: !!p.instagram })),
});
```

這兩個函式在 `packages/core/src/workspace.ts`，會加密 token、建立或更新帳號（已連結過的會換新 token
並恢復成 active）、寫 audit log。`userId` 要是該工作區的成員。token 從環境變數或標準輸入讀，不要放在
指令參數裡（會留在 shell history）。

**3. 確認**

- 帳號頁看得到粉專和 IG，狀態是 active。
- 工作區的 `publishing_enabled` 還沒開時，按「測試發文」只會記錄 `dry_run`，先用這個確認流程通。
- 真的發文用客戶的測試粉專，或先發「只限自己」可見的內容。

**token 失效時**：每天的快照和每次發文碰到授權錯誤時，會把帳號標成 `expired`。單一客戶模式沒有網頁上的
重新連結，要重新產生 token 再跑一次腳本（同一個粉專會更新 token，保留群組與時區設定）。

## 來源

| 項目 | 來源 | 頁面日期 |
|---|---|---|
| Vercel Hobby 不可商用 | https://vercel.com/docs/plans/hobby | 2026-09-14 |
| Vercel Pro 價格 | https://vercel.com/pricing | 未標 |
| Vercel Cron 頻率 | https://vercel.com/docs/cron-jobs/usage-and-pricing | 2026-07-15 |
| Vercel 函式時限 | https://vercel.com/docs/functions/limitations | 2026-08-24 |
| Supabase 方案 | https://supabase.com/pricing | 未標 |
| Supabase 區域 | https://supabase.com/docs/guides/platform/regions | 未標 |
| Next.js 自架（standalone、Server Action 金鑰、`after()`） | https://nextjs.org/docs/app/guides/self-hosting | 2026-10-15 |
| Cloud Run 計費與 CPU | https://docs.cloud.google.com/run/docs/configuring/billing-settings | 未標 |
| Cloud Run 逾時 | https://docs.cloud.google.com/run/docs/configuring/request-timeout | 未標 |
| Firebase App Hosting 支援版本 | https://firebase.google.com/docs/app-hosting/frameworks-tooling | 未標 |
| Cloud Scheduler 價格 | https://cloud.google.com/scheduler/pricing | 未標 |
| Cloud SQL 連 Cloud Run | https://docs.cloud.google.com/sql/docs/postgres/connect-run | 未標 |
| Cloud SQL Node connector | https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector | 未標 |
| Identity Platform 價格 | https://cloud.google.com/identity-platform/pricing | 未標 |
| Firebase Auth 限制 | https://firebase.google.com/docs/auth/limits | 未標 |
| Cloud Storage 簽名網址 | https://docs.cloud.google.com/storage/docs/access-control/signed-urls | 未標 |
| Meta Standard／Advanced Access | https://developers.facebook.com/docs/graph-api/overview/access-levels | 未標 |
| Meta 開發與 Live 模式 | https://developers.facebook.com/docs/development/build-and-test/app-modes | 未標 |
| Meta system user 產生 token | https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens | 未標 |
| Meta system user 數量 | https://developers.facebook.com/docs/marketing-api/system-users/overview | 未標 |
| 長效 token | https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived | 未標 |
| IG 發布需求 | https://developers.facebook.com/docs/instagram-platform/content-publishing | 未標 |
| Tech Provider | https://developers.facebook.com/docs/development/release/tech-providers/ | 未標 |
| Platform Terms（Service／Tech Provider） | https://developers.facebook.com/terms/dfc_platform_terms/ | 2026-02-03 |
