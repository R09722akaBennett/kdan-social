/**
 * Writing prompts for brand accounts, after Buffer's Templates: each says when it helps
 * and starts the composer with an outline to fill in. Written for this product, not
 * translated from Buffer's.
 */
export type Template = { key: string; kind: TemplateKind; title: string; when: string; starter: string };

export type TemplateKind = 'tip' | 'story' | 'behind' | 'engage';

export const TEMPLATE_KINDS: Record<TemplateKind, string> = {
  tip: '小技巧',
  story: '客戶故事',
  behind: '幕後花絮',
  engage: '互動',
};

export const TEMPLATES: Template[] = [
  {
    key: 'three-steps',
    kind: 'tip',
    title: '三個步驟完成一件事',
    when: '把產品最常被問的操作拆成三步，比整頁說明更容易被收藏。',
    starter: '【三步驟】＿＿＿\n\n1. ＿＿＿\n2. ＿＿＿\n3. ＿＿＿\n\n存起來，下次用得到。',
  },
  {
    key: 'myth',
    kind: 'tip',
    title: '一個常見的誤會',
    when: '大家以為要這樣做，其實不用。適合推出新功能或改版之後。',
    starter: '很多人以為＿＿＿，其實＿＿＿。\n\n我們的做法是：＿＿＿\n\n你也這樣以為過嗎？',
  },
  {
    key: 'before-after',
    kind: 'story',
    title: '用了之前、用了之後',
    when: '請一位客戶說說改變，配一張前後對照圖最有說服力。',
    starter: '以前＿＿＿要花＿＿＿。\n現在＿＿＿，只要＿＿＿。\n\n謝謝＿＿＿願意分享他們的故事。',
  },
  {
    key: 'customer-question',
    kind: 'story',
    title: '這週最多人問的問題',
    when: '把客服或留言裡反覆出現的問題公開回答一次。',
    starter: '這週最多人問：「＿＿＿？」\n\n答案是＿＿＿。\n\n還有想問的，留言告訴我們。',
  },
  {
    key: 'making-of',
    kind: 'behind',
    title: '這個是怎麼做出來的',
    when: '新品、活動或一張主視覺背後的過程，讓追蹤者看到人。',
    starter: '你看到的＿＿＿，背後其實＿＿＿。\n\n最難的是＿＿＿，最後我們＿＿＿。',
  },
  {
    key: 'team',
    kind: 'behind',
    title: '介紹一位同事',
    when: '每月一位，說說他負責什麼、最喜歡產品的哪個地方。',
    starter: '認識一下＿＿＿，他負責＿＿＿。\n\n他最常說的一句話是：「＿＿＿」\n\n他最推薦的功能：＿＿＿',
  },
  {
    key: 'this-or-that',
    kind: 'engage',
    title: '二選一',
    when: '最容易拿到留言的格式，適合活動前暖身或決定下一個主題。',
    starter: '＿＿＿ 還是 ＿＿＿？\n\n留言 A 或 B，我們下週公布結果。',
  },
  {
    key: 'countdown',
    kind: 'engage',
    title: '活動倒數',
    when: '大促或發表前幾天，每天一篇，各帳號可以照自己的時區發。',
    starter: '倒數 ＿ 天！\n\n＿＿＿ 就要開始了，今天先偷偷告訴你：＿＿＿\n\n記得＿＿＿。',
  },
];

export const templateByKey = (key: string | undefined) => TEMPLATES.find((t) => t.key === key);
