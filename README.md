# kdan-social

多平台社群發文與成效追蹤 SaaS：一篇內容同步發到 Facebook 粉專、Instagram、LINE 官方帳號，
並追蹤各帳號的粉絲數與貼文成效。一個客戶（品牌）可以連結多個粉專與帳號。

目前在研究階段，第一步是用公司自己的 Facebook 粉專做 demo。

## 文件

- [平台能力與限制](docs/platform-research.md)：各平台 API 能做什麼、多帳號怎麼接、Meta 審核流程
- [Roadmap](docs/roadmap.md)：demo → 開放品牌的階段規劃與待確認事項

## 開發

```bash
pnpm install
cp .env.example .env            # 填入 KDAN_SOCIAL_SECRET_KEY 與 CRON_SECRET
docker run --rm -d --name kdan-social-pg -e POSTGRES_PASSWORD=dev -p 54329:5432 postgres:17
pnpm --filter @kdan-social/core db:migrate
pnpm --filter @kdan-social/core db:seed-dev   # 只接受 localhost 的資料庫
pnpm --filter web dev
pnpm test && pnpm typecheck
```

| 目錄 | 內容 |
|---|---|
| `packages/core` | 資料表、token 加密、FB／IG／LINE 串接、發文派送、粉絲快照；不依賴 Next.js，之後搬 GCP 可直接沿用 |
| `apps/web` | Next.js 網頁與 Vercel Cron 入口（每分鐘派送發文、每天 00:30 台北時間做粉絲快照） |
| `prototype/` | 可點擊的設計原型（https://kdan-social-prototype.vercel.app），只當畫面參考 |

對外發文有兩道開關，都預設關閉：環境變數 `PUBLISHING_ENABLED=1`，以及每個工作區的
`publishing_enabled`。任一個沒開，排到的貼文只會記錄為 `dry_run`，不會呼叫平台。
