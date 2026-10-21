import { Icon, type IconName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';

type Use = { icon: IconName; title: string; why: string; scopes: string[] };

// Keep in step with META_SCOPES: Meta's reviewers check that every scope asked for is
// explained before the login dialog, and that the explanation matches what the app does.
const REQUIRED: Use[] = [
  { icon: 'link', title: '列出你管理的粉專', why: '下一步讓你勾選要加入哪些粉專。', scopes: ['pages_show_list', 'business_management'] },
  { icon: 'eye', title: '讀取粉專基本資料', why: '顯示粉專名稱與追蹤人數，並每天確認授權還有效。', scopes: ['pages_read_engagement'] },
  { icon: 'send', title: '以粉專身分發文', why: '在你排定的時間，把貼文發到粉專。', scopes: ['pages_manage_posts'] },
  { icon: 'eye', title: '讀取 Instagram 商業帳號', why: '找到粉專綁定的 IG 帳號，顯示帳號名稱與粉絲數。', scopes: ['instagram_basic'] },
  { icon: 'send', title: '發布到 Instagram', why: '在你排定的時間，把貼文發到 IG。', scopes: ['instagram_content_publish'] },
];

const OPTIONAL: Use[] = [
  { icon: 'comment', title: '讀取粉專貼文與互動', why: '匯入過去 60 天的貼文，計算心情、留言與分享。', scopes: ['pages_read_user_content'] },
  { icon: 'chart', title: '讀取粉專成效', why: '觸及、觀看、追蹤增減與粉絲地區。', scopes: ['read_insights'] },
  { icon: 'chart', title: '讀取 Instagram 成效', why: '觸及、觀看、收藏、分享與粉絲輪廓。', scopes: ['instagram_manage_insights'] },
  { icon: 'comment', title: '留下第一則留言', why: '貼文發出後，以粉專或 IG 帳號的身分在底下留你寫好的第一則留言。', scopes: ['pages_manage_engagement', 'instagram_manage_comments'] },
];

function Row({ u }: { u: Use }) {
  return (
    <div className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      <span style={{ color: 'var(--ink-2)', display: 'flex', marginTop: 2 }}><Icon name={u.icon} size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{u.title}</div>
        <div className="small" style={{ color: 'var(--ink-2)' }}>{u.why}</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>{u.scopes.join('、')}</div>
      </div>
    </div>
  );
}

/**
 * What the Facebook login is about to ask for, before it asks: a permission list like
 * Hotjar's and Dropbox Dash's connect screens, and Linktree's "what we won't do" box.
 */
export default async function ConnectFacebook() {
  await requireWorkspace();
  return (
    <main className="main" style={{ maxWidth: 760, margin: '0 auto' }}>
      <header>
        <div className="small"><a href="/app/channels">帳號與群組</a> / 連結 Facebook</div>
        <h1 style={{ marginTop: 4 }}>連結 Facebook 粉專與 Instagram</h1>
        <div className="sub">接下來會開啟 Facebook 的授權畫面。先看一下 kdan-social 會用到哪些權限、各自用來做什麼。</div>
      </header>

      <section className="card card-pad stack" aria-labelledby="h-before" style={{ gap: 8 }}>
        <h2 id="h-before">開始前確認</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>你是粉專的管理員，或擁有粉專的完整控制權。</li>
          <li>Instagram 要是商業帳號或創作者帳號，並且已經綁定到粉專；個人帳號沒有發文 API。</li>
          <li>在授權畫面勾選要加入的粉專，並保留所有權限的勾選。</li>
        </ul>
      </section>

      <section className="card" aria-labelledby="h-required">
        <div className="card-head">
          <div>
            <h2 id="h-required">發文需要的權限</h2>
            <div className="small muted">少了任何一項，加入的帳號就發不出貼文。</div>
          </div>
        </div>
        {REQUIRED.map((u) => <Row key={u.title} u={u} />)}
      </section>

      <section className="card" aria-labelledby="h-optional">
        <div className="card-head">
          <div>
            <h2 id="h-optional">選用的權限</h2>
            <div className="small muted">不授權也能正常發文，只是成效頁會少這些數字，也不能留第一則留言。</div>
          </div>
        </div>
        {OPTIONAL.map((u) => <Row key={u.title} u={u} />)}
      </section>

      <section className="card card-pad row" aria-labelledby="h-wont" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12, background: 'var(--ok-soft)', borderColor: 'transparent' }}>
        <span style={{ color: 'var(--ok)', display: 'flex', marginTop: 2 }}><Icon name="lock" size={18} /></span>
        <div className="stack" style={{ gap: 4 }}>
          <h2 id="h-wont" style={{ fontSize: 15 }}>kdan-social 不會做的事</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <li>不會讀取或回覆私訊。</li>
            <li>不會回覆、隱藏或刪除別人的留言；只會留下你在貼文裡寫好的第一則留言。</li>
            <li>不會碰你的個人 Facebook 帳號、好友或個人動態。</li>
            <li>不會在沒有排程的時候發文；新工作區的對外發文預設是關閉的。</li>
            <li>存取權杖加密保存，不會顯示在畫面上。隨時可以在 Facebook 設定的「商業整合」移除授權。</li>
          </ul>
        </div>
      </section>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <a className="btn" href="/app/channels">取消</a>
        <a className="btn" href="/api/meta/connect" style={{ background: 'var(--fb)', borderColor: 'var(--fb)', color: '#fff', fontWeight: 600, minHeight: 44 }}>用 Facebook 繼續</a>
      </div>
    </main>
  );
}
