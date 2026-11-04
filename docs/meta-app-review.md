# Meta app 正式化：移轉、商業驗證、App Review

這份文件給接手 Meta 審核的同事和他的 AI 助理當背景資料。內容自成一份，不用先讀過程式碼。
程式交接之後，其他背景請看 [README](../README.md)、[platform-research.md](platform-research.md)、
[roadmap.md](roadmap.md)、[deploy.md](deploy.md)。

> 本文的現況是 2026-11 從程式碼與文件整理出來的。Meta 的後台介面、權限名稱和審核要求常常改，
> 每一步動手前都要對照 Meta 最新的官方文件。

## 產品背景

kdan-social 是 KDAN 的多平台社群發文與成效追蹤 SaaS，定位類似 Buffer、Hootsuite：

- 一篇內容同步發到 Facebook 粉專、Instagram 專業帳號、LINE 官方帳號，每個帳號可以各自改寫、排程。
- 追蹤粉絲數、每篇貼文的互動與 insights，加上 AI 分析。
- 留言收件匣：在 kdan-social 裡讀取並回覆 FB 和 IG 留言。
- 一個客戶（工作區）可以連結多個粉專和帳號，成員分角色，有審核流程。

使用對象：先給 KDAN 自己的台灣、美國、日本市場用，接著開放第一個外部客戶 Bandai 自助開通。
產品做成即插即用，客戶在網頁上連結帳號，不為單一客戶客製或部署。

技術棧：TypeScript、Next.js（`apps/web`）、與框架無關的核心套件（`packages/core`）、
Supabase Postgres、Drizzle。目前部署在 Vercel，網址是 https://kdan-social.vercel.app。

## 為什麼要正式化

Meta 審核的對象是**我們的 app**，不是每個品牌。審過一次之後，任何品牌都只要在 Meta 的授權畫面
點同意就能連結粉專，不需要開發者帳號或 API key。

app 現在還在**開發模式**：只有在 app 上有角色（管理員、開發者、測試者）的人能授權。
所以目前每個試用者都得先手動加成測試者，這樣沒辦法開放給外部客戶自助使用。

## 現況

| 項目 | 現況 |
|---|---|
| Meta App ID | `1582239959893232` |
| 擁有者 | Bennett 個人的 Meta 商業帳號（還不是 KDAN 公司的） |
| 模式 | 開發模式 |
| 用途（use cases） | Manage everything on your Page；Manage messaging & content on Instagram（API setup with Facebook Login） |
| 授權方式 | Facebook Login for Business，使用者在授權畫面勾選要給哪些粉專 |
| OAuth redirect URI | `https://kdan-social.vercel.app/api/meta/callback` |
| Graph API 版本 | v25.0 |
| 網域 | `*.vercel.app`，還沒有公司網域 |
| 商業驗證 | 未做 |
| App Review | 未送 |
| 隱私權政策頁面 | **沒有** |
| 資料刪除說明或 callback | **沒有** |
| 審核用的操作錄影 | 未錄 |

## 要申請的權限

權限清單在 `packages/core/src/platforms/meta-oauth.ts` 的 `META_SCOPES`。每個權限都要在 app 的
用途裡啟用，並在 App Review 申請 Advanced Access。

| 權限 | 必要性 | 用在哪裡 |
|---|---|---|
| `pages_show_list` | 必要 | 列出使用者管理的粉專，讓他選要連結哪些 |
| `pages_read_engagement` | 必要 | 讀粉專資料、粉絲數、貼文互動數 |
| `pages_manage_posts` | 必要 | 發文到粉專（文字、圖片、影片、Reels） |
| `business_management` | 必要 | 讀取透過 Meta 商業帳號管理的粉專 |
| `instagram_basic` | 必要 | 讀取粉專連結的 IG 專業帳號資料 |
| `instagram_content_publish` | 必要 | 發布 IG 單圖、輪播、Reels、限時動態 |
| `pages_read_user_content` | 選用 | 列出粉專貼文、讀取貼文的反應與留言（成效頁、留言收件匣） |
| `read_insights` | 選用 | 粉專與貼文的 insights（觀看數等） |
| `instagram_manage_insights` | 選用 | IG 帳號與貼文的 insights、追蹤者分布、推薦時段 |
| `pages_manage_engagement` | 選用 | 自動發第一則留言、在收件匣回覆 FB 留言 |
| `instagram_manage_comments` | 選用 | 自動發第一則留言、在收件匣讀取並回覆 IG 留言 |

「選用」的意思是使用者在授權畫面取消勾選後，帳號還是能發文，只是少了那部分功能。
App Review 還是要全部申請，不然正式模式下沒有人拿得到這些權限。

## 要做的事

### 1. 把 app 移轉到 KDAN 的 Meta 商業帳號

- 移轉現有的 app，**不要另外新開一個**。新開的話 App ID 和 secret 要重設，用途、權限、
  redirect URI 要重新設定，已經連結的粉專也要全部重新授權。
- **移轉核准後不能撤回，而且要在商業驗證之前完成。**
- 要確認：誰有 KDAN 商業帳號的管理權限、移轉要誰發起、誰核准。

### 2. 商業驗證

- 用 KDAN 公司的實體驗證，需要公司登記文件，以及網域或電話驗證。
- 要確認：需要哪些文件、由誰提供、公司網站上的資訊和登記資料是否一致。

### 3. 準備送審需要的頁面與網域

- **正式網域**：送審前從 `kdan-social.vercel.app` 換成公司網域，例如 `social.kdanmobile.com`。
  換網域之後，Meta app 的 redirect URI 也要改。寄信服務（Resend，讓忘記密碼的信寄得到客戶）
  也需要能改 DNS 的網域，可以一起處理。
- **隱私權政策**：要有一個公開網址。內容要說明蒐集哪些 Meta 資料、用途、保存多久、怎麼刪除。
  KDAN 適用台灣個資法（PDPA）、GDPR、CCPA，**請法務審閱**。
- **資料刪除**：Meta 要求提供資料刪除說明網址，或實作資料刪除 callback（使用者在 Facebook
  移除 app 時，Meta 會通知我們刪資料）。這部分程式還沒做，要決定走哪一種。
- **app 基本資料**：圖示、類別、聯絡信箱、服務條款網址。

### 4. App Review

- 每個權限各寫一段用途說明，附上操作錄影，示範這個權限在產品裡怎麼用。
- 審核人員會登入測試，要準備一組測試帳號與測試粉專，並寫清楚登入步驟（註冊需要邀請碼）。
- 通常要數週，Meta 常會要求補件。

建議錄影的流程（一支影片可以涵蓋多個權限，但每個權限的畫面都要清楚出現）：

1. 登入 kdan-social → 按「連結帳號」→ Facebook 授權畫面 → 勾選粉專與權限 → 回到 kdan-social 看到已連結的粉專與 IG
   （`pages_show_list`、`business_management`、`instagram_basic`）
2. 寫一篇貼文 → 發到粉專 → 到 Facebook 上看到貼文（`pages_manage_posts`）
3. 發一篇 IG 圖片或 Reels → 到 Instagram 上看到（`instagram_content_publish`）
4. 設定第一則留言 → 發文後留言出現（`pages_manage_engagement`、`instagram_manage_comments`）
5. 打開成效頁 → 粉絲數、貼文互動、insights（`pages_read_engagement`、`read_insights`、`instagram_manage_insights`）
6. 打開留言收件匣 → 讀取並回覆 FB 與 IG 留言（`pages_read_user_content`、`pages_manage_engagement`、`instagram_manage_comments`）

### 5. 切換成 Live

- 審核通過後把 app 切到 Live。之後只有新增權限才要再送審，另外每年要做一次 Data Use Checkup。

## 程式上會動到的地方

這段給之後接手程式的人：

| 項目 | 位置 |
|---|---|
| App ID 與 secret | 環境變數 `META_APP_ID`、`META_APP_SECRET`（Vercel 專案設定） |
| 權限清單 | `packages/core/src/platforms/meta-oauth.ts` 的 `META_SCOPES`、`OPTIONAL_META_SCOPES` |
| OAuth 起點與 callback | `apps/web/app/api/meta/connect/route.ts`、`apps/web/app/api/meta/callback/route.ts` |
| redirect URI | 由正式網址組成 `<正式網址>/api/meta/callback`，換網域時 Meta 後台也要同步改 |
| Graph API 版本 | `packages/core/src/platforms/meta.ts` 的 `GRAPH_VERSION` |
| 隱私權政策、資料刪除 | 還沒有，要新增 |

## 注意事項

- secret、token、資料庫密碼不要貼進 AI 對話、文件或聊天訊息。
- 對外發文有兩道開關，預設都關：環境變數 `PUBLISHING_ENABLED=1`，以及每個工作區的
  `publishing_enabled`。錄影時要打開，才會真的發出去，建議只在測試粉專的工作區打開。
- 審核期間有外部試用者時，他們授權用的 FB 帳號要先加成 app 測試者。

## 要問清楚的事

- KDAN 的 Meta 商業帳號由誰管理？移轉由誰發起、誰核准？
- 正式網域用哪個？誰能設定 DNS？
- 隱私權政策和服務條款要沿用 KDAN 既有的，還是另外寫一份？法務由誰審？
- 資料刪除要走說明頁還是 callback？
- 審核人員用的測試帳號與測試粉專由誰準備？
