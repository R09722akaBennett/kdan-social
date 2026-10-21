import { aiConfigured, formatInZone, getVoice, lineClient, lineUsage, listAccounts, listGroups, listTags, loadKey, reviewDetail, tagsForPosts } from '@kdan-social/core';
import { notFound } from 'next/navigation';
import { zoneName } from '@/components/ui';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseEnv } from '@/lib/supabase';
import Composer from '../../new/Composer';

// The same full-page composer, started from the post, as Later edits a scheduled post in place.
export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace, role } = await requireWorkspace();
  const db = getDb();
  const d = await reviewDetail(db, { workspaceId: workspace.id, postId: id });
  if (!d) notFound();
  const manager = role === 'owner' || role === 'admin';
  const refusal = !manager && d.post.createdBy !== user.email ? '只有作者、擁有者或管理員可以修改這篇貼文。'
    : d.versions.some((v) => v.taskStatus !== 'scheduled') ? '這篇貼文已經有帳號發出或正在發送，不能再修改。'
    : null;
  if (refusal) {
    return (
      <main className="main" style={{ maxWidth: 560, margin: '64px auto' }}>
        <h1>不能修改這篇貼文</h1>
        <p>{refusal}</p>
        <a className="btn" href={`/app/approvals?post=${id}`}>回到貼文</a>
      </main>
    );
  }

  const [groups, accounts, usage, voice, tags, postTags] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
    getVoice(db, workspace.id),
    listTags(db, workspace.id),
    tagsForPosts(db, [d.post.id]),
  ]);
  // Posts from before the main text was kept fall back to the first version's text.
  const main = d.post.body ?? d.versions[0]?.body ?? '';
  const when = [...new Set(d.versions.map((v) => `${formatInZone(v.runAt, v.timeZone)}（${zoneName(v.timeZone)}）`))].join(' · ');
  return (
    <Composer
      workspace={workspace.name}
      role={role}
      groups={groups.map(({ id: gid, name }) => ({ id: gid, name }))}
      accounts={accounts.map(({ id: aid, groupId, timeZone, platform, name, status }) => ({ id: aid, groupId, timeZone, platform, name, status }))}
      supabase={supabaseEnv()}
      aiReady={aiConfigured()}
      banned={voice.banned}
      lineUsage={usage.map(({ accountId, quota, audience, error }) => ({ accountId, quota, audience, error }))}
      tags={tags.map(({ id: tid, name, color }) => ({ id: tid, name, color }))}
      edit={{
        postId: d.post.id,
        accountIds: d.versions.map((v) => v.accountId),
        main,
        custom: Object.fromEntries(d.versions.filter((v) => v.body !== main).map((v) => [v.accountId, v.body])),
        media: d.versions[0]?.media ?? [],
        firstComment: d.post.firstComment ?? '',
        tagIds: postTags.get(d.post.id)?.map((t) => t.id) ?? [],
        notes: d.comments.map((c) => ({ author: c.author, body: c.body, at: formatInZone(c.createdAt, workspace.timeZone) })),
        when,
      }}
    />
  );
}
