// Sample data for the prototype. Names and numbers are placeholders.

export const PF = {
  fb: { label: 'f', name: 'Facebook' },
  ig: { label: 'IG', name: 'Instagram' },
  line: { label: 'L', name: 'LINE' },
};

export const MARKETS = {
  tw: { code: 'TW', name: '台灣', lang: 'zh-Hant-TW', langName: '繁體中文', tz: '台北（GMT+8）', zone: '台北', localTime: '18:02', reviewer: '台灣行銷主管' },
  us: { code: 'US', name: '美國', lang: 'en-US', langName: 'English', tz: 'New York（ET）', zone: 'EDT', localTime: '06:02', reviewer: 'US Marketing' },
  jp: { code: 'JP', name: '日本', lang: 'ja-JP', langName: '日本語', tz: '東京（JST）', zone: 'JST', localTime: '19:02', reviewer: '日本マーケティング担当' },
};
export const MARKET_KEYS = ['tw', 'us', 'jp'];

export const ACCOUNTS = [
  { id: 'tw_fb', market: 'tw', pf: 'fb', name: 'KDAN Mobile 台灣', kind: 'Facebook 粉專', followers: 32904, grow: { 7: 128, 30: 541, 90: 1480 } },
  { id: 'tw_ig', market: 'tw', pf: 'ig', name: '@kdanmobile_tw', kind: 'Instagram 商業帳號', followers: 9876, grow: { 7: 164, 30: 602, 90: 602 } },
  { id: 'tw_line', market: 'tw', pf: 'line', name: 'KDAN 官方帳號', kind: 'LINE 官方帳號', followers: 5430, grow: { 7: 20, 30: 96, 90: 310 }, quota: { used: 62, left: 2060 } },
  { id: 'us_fb', market: 'us', pf: 'fb', name: 'KDAN Mobile', kind: 'Facebook 粉專', followers: 58120, grow: { 7: 410, 30: 1620, 90: 4410 } },
  { id: 'us_ig', market: 'us', pf: 'ig', name: '@kdanmobile', kind: 'Instagram 商業帳號', followers: 21340, grow: { 7: 233, 30: 980, 90: 2650 } },
  { id: 'jp_fb', market: 'jp', pf: 'fb', name: 'KDAN Mobile 日本', kind: 'Facebook 粉專', followers: 12450, grow: { 7: 52, 30: 210, 90: 640 } },
  { id: 'jp_ig', market: 'jp', pf: 'ig', name: '@kdanmobile_jp', kind: 'Instagram 商業帳號', followers: 6210, grow: { 7: 98, 30: 98, 90: 98 } },
  { id: 'jp_line', market: 'jp', pf: 'line', name: 'KDAN Japan', kind: 'LINE 官方帳號', followers: 18900, grow: { 7: 140, 30: 580, 90: 1720 }, quota: { used: 18, left: 41000 } },
];

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Approval items. Each market version is approved by that market's reviewer.
export const APPROVAL_ITEMS = {
  p1: {
    title: '雙十一優惠預告',
    meta: '行銷部送審 · 10/20 15:20 · 最早一則今天 20:00 發布',
    versions: {
      tw: [
        ['fb', 'KDAN Mobile 台灣', '雙十一優惠預告｜PDF Reader 全方案 5 折\n11/11 00:00 開跑，限時 72 小時。年度最優惠，先把日期記起來！\n活動說明 → kdan.cc/1111'],
        ['ig', '@kdanmobile_tw', '雙十一來了｜PDF Reader 全方案 5 折\n11/11 00:00 開跑，只有 72 小時。先收藏這篇！'],
        ['line', 'KDAN 官方帳號', '【雙十一預告】PDF Reader 全方案 5 折\n11/11 00:00 開跑，限時 72 小時'],
      ],
      us: [
        ['fb', 'KDAN Mobile', '11.11 Global Sale: 50% off every PDF Reader plan\nStarts Nov 11 at 12:00 AM ET and runs for 72 hours.\nDetails: kdan.cc/1111-us'],
        ['ig', '@kdanmobile', '50% off every PDF Reader plan, for 72 hours only.\nThe 11.11 Global Sale starts Nov 11 at 12:00 AM ET.'],
      ],
      jp: [
        ['fb', 'KDAN Mobile 日本', '【11.11 セール予告】PDF Reader 全プラン 50% OFF\n11月11日 0:00 スタート、72時間限定です。\n詳細はこちら：kdan.cc/1111-jp'],
        ['ig', '@kdanmobile_jp', 'PDF Reader 全プランが 50% OFF になります。\n11.11 セールは 11月11日 0:00 から72時間限定。'],
        ['line', 'KDAN Japan', '【11.11 セール予告】\nPDF Reader 全プラン 50% OFF\n11/11 0:00〜72時間限定'],
      ],
    },
    diff: {
      us: [
        'Discount wording: "5 折" becomes "50% off" (same discount).',
        'Start time changed to Nov 11, 12:00 AM ET, so the US sale ends 12 hours after Taiwan.',
        'Link points to the US landing page; no LINE version because the US market has no LINE account.',
      ],
      jp: ['「5 折」を「50% OFF」に変更（割引率は同じ）', '開始時刻を日本時間 11/11 0:00 に変更', 'リンクを日本向けページに差し替え'],
    },
    comments: {
      jp: [{ initial: 'J', who: '日本マーケティング担当', when: '10/20 16:05', lang: 'ja-JP', text: '「お支払い時に自動で適用」は「ご購入時に自動適用」に統一してください。', tr: '請把「付款時自動套用」統一改成「購買時自動套用」。' }],
    },
  },
  p2: {
    title: '新功能：AI 摘要支援長文件',
    meta: '日本チーム送審 · 10/20 11:40 · 10/22 21:00 JST 發布',
    versions: {
      jp: [
        ['fb', 'KDAN Mobile 日本', '新機能：AI 要約が 30 ページ以上の長い文書に対応しました。\n契約書やレポートも、要点だけをすばやく確認できます。'],
        ['ig', '@kdanmobile_jp', '長い文書も、要点だけ。\nAI 要約が 30 ページ以上に対応しました。'],
      ],
    },
    diff: {},
    comments: {},
  },
};
