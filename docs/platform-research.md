# 平台能力與限制

以下整理自 2026-10 的初步研究，依據是截至 2026 年中的官方文件認知。
頻率限制、指標名稱、計費方式變動頻繁，實作前要對照最新官方文件。

## 結論

一個客戶連結多個 FB 粉專、多個 IG 帳號、多個 LINE 官方帳號都做得到。硬限制：

- 只能發到 **FB 粉專** 與 **IG 商業／創作者帳號**。FB 個人頁、FB 社團、IG 個人帳號沒有發文 API。
- LINE 的「發文」實際上是 Messaging API 群發訊息給官方帳號好友，會扣客戶方案的訊息額度。
  LINE VOOM 貼文沒有公開 API。

## 各平台

| | 發文 | 粉絲數／成效 | 帳號條件 |
|---|---|---|---|
| Facebook | 粉專貼文、圖片、影片、Reels；API 原生支援排程（`scheduled_publish_time`） | 粉專 `followers_count`、Page Insights | 粉專，授權者需有管理權限 |
| Instagram | 單圖、輪播、Reels、限動；API 無排程，需自建排程器 | `followers_count`、媒體與帳號 insights | 商業或創作者帳號 |
| LINE | Messaging API broadcast（全部好友）／multicast（指定名單）／narrowcast（受眾） | insight API：好友數、可觸及人數、封鎖數，資料隔天才有 | LINE 官方帳號 + Messaging API channel |

### 補充（2026-10 查證）

- **LINE 依收件人數計費**：一次請求最多 5 個訊息物件，每位收件人只算 1 則；
  「文字＋圖片」和「一張圖文卡片」扣的額度一樣。要省額度只能縮小受眾，不能靠合併訊息。
  本月上限與已用量各有一支 API（`/v2/bot/message/quota`、`/v2/bot/message/quota/consumption`）。
- **LINE 不需要 webhook**：群發與 insight 都是我們主動呼叫，不會動到客戶既有的聊天機器人設定。
- **FB 觸及／曝光指標已停用**：2025-11 一波、2026-06（Graph API v25）一波，改為 views 系列。
  新舊算法不同，數字不能接續比較。
- **IG 替代文字**：2025-03 起圖片貼文（含輪播的圖片）可帶 `alt_text`；Reels、限動不支援。
- **IG 推薦時段**：`online_followers` 可取得追蹤者各時段上線人數，帳號需 100 位以上追蹤者，只回溯 30 天。
  FB 沒有對應指標，只能用自己的貼文成效推算。

## 多帳號串接

- **FB / IG**：客戶用 Facebook Login for Business 授權一次，在 Meta 授權畫面勾選要給的粉專。
  `me/accounts` 取得每個粉專各自的 page token，`instagram_business_account` 取得粉專連結的 IG。
  也可以走不需綁粉專的 Instagram Login 單獨接 IG。
- **LINE**：每個官方帳號各有 channel access token。一般沒有一鍵授權，常見做法是客戶到
  LINE Developers 開 Messaging API channel，把 channel ID / secret 貼進產品；
  一鍵授權（module channel）需加入 LINE 合作夥伴計畫。
- **資料模型**：workspace（客戶）→ connected accounts（各自的平台、加密 token）→
  發文任務（一篇內容展開成每個帳號一個任務，各自記錄成功或失敗）。

## Meta 審核

- 審核對象是 **我們的 app**，不是每個品牌。審過一次後，所有品牌都只需點擊 OAuth 授權，
  不需要開發者帳號或 API key（Buffer、Hootsuite 都是這個模式）。
- 開發模式下，只有在 app 有角色（管理員／開發者／測試者）的人能授權。
  demo 階段用公司粉專不需送審；早期試用品牌可以手動加成測試者。
- 開放給外部品牌前要完成：
  - 商業驗證（公司登記資料）
  - App Review：每個權限申請 Advanced Access（發文、insights、IG 發布等），
    附操作錄影、隱私權政策網址、資料刪除說明。通常需要數週並來回補件。
- 之後只有新增權限才需要再送審；另有每年一次的 Data Use Checkup。

## 實作上的難點

1. **Token 失效**：客戶改密碼、粉專權限被移除都會讓 token 失效，需要偵測與「重新連結」流程，
   否則排程貼文會默默失敗。
2. **IG 媒體必須是公開網址**：IG API 從網址抓圖片／影片，需要自有儲存與 CDN；
   影片要先建 container、等處理完才能發布（非同步）。
3. **各平台格式不同**：FB 可純文字，IG 必須有媒體，LINE 是訊息格式（文字、圖片、Flex Message）。
   「同步發文」實際上需要讓使用者針對各平台調整內容。
4. **粉絲數歷史要自己存**：API 多半只給當下數字，IG 每日粉絲數 insights 只回溯約 30 天，
   長期趨勢需每日快照。
5. **頻率限制**：IG 每帳號每 24 小時的 API 發文數有上限；Graph API 有每個粉專的呼叫額度。
6. **指標會變**：Meta 不定期停用或改名 Page / IG insights 指標，需預留維護成本。
   2025-11 與 2026-06 的 FB 觸及／曝光停用就是實例，抓指標的程式要集中在一層。

## 加分功能

- IG Business Discovery API：只要知道帳號名稱，就能查其他商業帳號的公開粉絲數與貼文，可做競品追蹤。
  FB 粉專的競品資料需要特殊權限（Page Public Content Access），難以取得。

## 參考競品

Buffer、Hootsuite 皆以「頻道數／帳號數」分級收費，對應每個帳號的 token 維護、API 額度與每日快照成本。
Buffer 方案中的「API access」是 Buffer 開放自己的 API 給客戶使用，與串接社群平台是兩回事。
