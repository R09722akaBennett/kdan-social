import { aiConfigured, getGroupVoices, getVoice, listAccounts, listGroups } from '@kdan-social/core';
import { VoiceEditor } from '@/components/voice';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { sampleAction, saveVoiceAction } from '@/app/app/actions';
import { NoticeToast } from '@/components/toast';

// After Customer.io's Tone & Voice (sliders with a live preview) and Jasper's brand voice
// (a description plus example posts), as the prototype lays them out.
export default async function BrandVoice({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const db = getDb();
  const [voice, groupVoices, groups, accounts] = await Promise.all([getVoice(db, workspace.id), getGroupVoices(db, workspace.id), listGroups(db, workspace.id), listAccounts(db, workspace.id)]);
  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>品牌語氣</h1>
          <div className="sub">AI 寫文案、改寫、在地化時都照這裡。品牌設定套用到所有帳號；群組可以再疊加自己的規則（選填）。</div>
        </div>
      </header>
      {sp.error && <div className="alert" role="alert"><div className="body">{sp.error}</div></div>}
      {sp.notice && <NoticeToast text={sp.notice} />}
      <VoiceEditor
        initial={voice}
        initialGroups={Object.fromEntries(groupVoices)}
        groups={groups.map((g) => ({ id: g.id, name: g.name, accounts: accounts.filter((a) => a.groupId === g.id).map(({ id, name, platform }) => ({ id, name, platform })) }))}
        editable={role === 'owner' || role === 'admin'}
        aiReady={aiConfigured()}
        save={saveVoiceAction}
        sample={sampleAction}
      />
    </main>
  );
}
