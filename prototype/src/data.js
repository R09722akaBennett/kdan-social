// Sample data for the prototype. Names and numbers are placeholders.

export const PF = {
  fb: { label: 'f', name: 'Facebook' },
  ig: { label: 'IG', name: 'Instagram' },
  line: { label: 'L', name: 'LINE' },
};

// Time zones an account can be set to, as Buffer's channel settings offer them.
export const TIME_ZONES = [
  { id: 'Asia/Taipei', label: '台北（GMT+8）', short: '台北', now: '18:02' },
  { id: 'America/New_York', label: 'New York（GMT−4）', short: 'New York', now: '06:02' },
  { id: 'Asia/Tokyo', label: '東京（GMT+9）', short: '東京', now: '19:02' },
  { id: 'Asia/Singapore', label: '新加坡（GMT+8）', short: '新加坡', now: '18:02' },
  { id: 'Europe/London', label: 'London（GMT+1）', short: 'London', now: '11:02' },
];
export const tzOf = (id) => TIME_ZONES.find((z) => z.id === id) ?? TIME_ZONES[0];

// Account groups are named by the customer; these three are just how KDAN chose to split.
export const INITIAL_GROUPS = [
  { id: 'g1', name: '台灣' },
  { id: 'g2', name: '美國' },
  { id: 'g3', name: '日本' },
];

export const ACCOUNTS = [
  { id: 'tw_fb', group: 'g1', tz: 'Asia/Taipei', pf: 'fb', name: 'KDAN Mobile 台灣', kind: 'Facebook 粉專', followers: 32904, grow: { 7: 128, 30: 541, 90: 1480 } },
  { id: 'tw_ig', group: 'g1', tz: 'Asia/Taipei', pf: 'ig', name: '@kdanmobile_tw', kind: 'Instagram 商業帳號', followers: 9876, grow: { 7: 164, 30: 602, 90: 602 } },
  { id: 'tw_line', group: 'g1', tz: 'Asia/Taipei', pf: 'line', name: 'KDAN 官方帳號', kind: 'LINE 官方帳號', followers: 5430, grow: { 7: 20, 30: 96, 90: 310 }, quota: { used: 62, left: 2060 } },
  { id: 'us_fb', group: 'g2', tz: 'America/New_York', pf: 'fb', name: 'KDAN Mobile', kind: 'Facebook 粉專', followers: 58120, grow: { 7: 410, 30: 1620, 90: 4410 } },
  { id: 'us_ig', group: 'g2', tz: 'America/New_York', pf: 'ig', name: '@kdanmobile', kind: 'Instagram 商業帳號', followers: 21340, grow: { 7: 233, 30: 980, 90: 2650 } },
  { id: 'jp_fb', group: 'g3', tz: 'Asia/Tokyo', pf: 'fb', name: 'KDAN Mobile 日本', kind: 'Facebook 粉專', followers: 12450, grow: { 7: 52, 30: 210, 90: 640 } },
  { id: 'jp_ig', group: 'g3', tz: 'Asia/Tokyo', pf: 'ig', name: '@kdanmobile_jp', kind: 'Instagram 商業帳號', followers: 6210, grow: { 7: 98, 30: 98, 90: 98 } },
  { id: 'jp_line', group: 'g3', tz: 'Asia/Tokyo', pf: 'line', name: 'KDAN Japan', kind: 'LINE 官方帳號', followers: 18900, grow: { 7: 140, 30: 580, 90: 1720 }, quota: { used: 18, left: 41000 } },
];
export const accountById = (id) => ACCOUNTS.find((a) => a.id === id);

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Posts waiting for approval: one main text, and the accounts whose text was customised.
export const APPROVAL_ITEMS = {
  p1: {
    title: '雙十一優惠預告',
    submittedBy: '小美（編輯）',
    submittedAt: '10/20 15:20',
    firstRun: '今天 20:00',
    body: '雙十一優惠預告｜PDF Reader 全方案 5 折\n11/11 00:00 開跑，限時 72 小時。年度最優惠，先把日期記起來！\n活動說明 → kdan.cc/1111',
    accounts: {
      tw_fb: null,
      tw_ig: '雙十一來了｜PDF Reader 全方案 5 折\n11/11 00:00 開跑，只有 72 小時。先收藏這篇！',
      us_fb: '11.11 Global Sale: 50% off every PDF Reader plan\nStarts Nov 11 at 12:00 AM ET and runs for 72 hours.\nDetails: kdan.cc/1111-us',
      us_ig: '50% off every PDF Reader plan, for 72 hours only.\nThe 11.11 Global Sale starts Nov 11 at 12:00 AM ET.',
      jp_fb: '【11.11 セール予告】PDF Reader 全プラン 50% OFF\n11月11日 0:00 スタート、72時間限定です。\n詳細はこちら：kdan.cc/1111-jp',
    },
    comments: [{ initial: '主', who: '王主管（擁有者）', when: '10/20 16:05', text: '日本版的「お支払い時に自動で適用」請統一成「ご購入時に自動適用」。' }],
  },
  p2: {
    title: '新功能：AI 摘要支援長文件',
    submittedBy: '小林（編輯）',
    submittedAt: '10/20 11:40',
    firstRun: '10/22 21:00',
    body: '新機能：AI 要約が 30 ページ以上の長い文書に対応しました。\n契約書やレポートも、要点だけをすばやく確認できます。',
    accounts: { jp_fb: null, jp_ig: '長い文書も、要点だけ。\nAI 要約が 30 ページ以上に対応しました。' },
    comments: [],
  },
};
