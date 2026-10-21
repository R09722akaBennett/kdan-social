import { aiConfigured, getIdea, getVoice, lineClient, lineUsage, listAccounts, listDrafts, listGroups, listTags, loadKey, planItem, tagsForPosts } from '@kdan-social/core';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseEnv } from '@/lib/supabase';
import { NoticeToast } from '@/components/toast';
import { templateByKey } from '@/lib/templates';
import Composer from './Composer';

// Full-page, without the sidebar, as in the prototype.
export default async function NewPost({ searchParams }: { searchParams: Promise<{ plan?: string; item?: string; draft?: string; account?: string; idea?: string; template?: string; another?: string; notice?: string }> }) {
  const { user, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const db = getDb();
  // A post the AI assistant proposed; only the asker's own conversation is read.
  const item = sp.plan && /^[0-9a-f-]{36}$/.test(sp.plan) ? await planItem(db, { workspaceId: workspace.id, userId: user.id, messageId: sp.plan, index: Number(sp.item) || 0 }) : null;
  // An idea or a template only seeds the text; nothing links the post back to it.
  const idea = sp.idea ? await getIdea(db, { workspaceId: workspace.id, id: sp.idea }) : null;
  const template = templateByKey(sp.template);
  const draft = sp.draft ? (await listDrafts(db, { workspaceId: workspace.id })).find((d) => d.post.id === sp.draft) : undefined;
  const [groups, accounts, usage, voice, tags, draftTags] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
    getVoice(db, workspace.id),
    listTags(db, workspace.id),
    draft ? tagsForPosts(db, [draft.post.id]) : null,
  ]);
  return (
    <>
      {sp.notice && <NoticeToast text={sp.notice} />}
      <Composer
        workspace={workspace.name}
        role={role}
        groups={groups.map(({ id, name }) => ({ id, name }))}
        accounts={accounts.map(({ id, groupId, timeZone, platform, name, status }) => ({ id, groupId, timeZone, platform, name, status }))}
        supabase={supabaseEnv()}
        aiReady={aiConfigured()}
        banned={voice.banned}
        lineUsage={usage.map(({ accountId, quota, audience, error }) => ({ accountId, quota, audience, error }))}
        draft={draft && {
          postId: draft.post.id,
          accountIds: draft.versions.map((v) => v.accountId),
          main: draft.post.body ?? '',
          custom: Object.fromEntries(draft.versions.filter((v) => v.body !== (draft.post.body ?? '')).map((v) => [v.accountId, v.body])),
          media: draft.versions[0]?.media ?? [],
          firstComment: draft.post.firstComment ?? '',
          tagIds: draftTags?.get(draft.post.id)?.map((t) => t.id) ?? [],
        }}
        tags={tags.map(({ id, name, color }) => ({ id, name, color }))}
        another={sp.another === '1'}
        start={item ? { accountIds: item.accountIds.filter((id) => accounts.some((a) => a.id === id)), main: item.body, date: item.date, time: item.time }
          // Opened from an account's page: that account starts ticked.
          : idea ? { accountIds: [], main: [idea.title, idea.body].filter(Boolean).join('\n\n') }
          : template ? { accountIds: [], main: template.starter }
          : accounts.some((a) => a.id === sp.account) ? { accountIds: [sp.account!], main: '' } : undefined}
      />
    </>
  );
}
