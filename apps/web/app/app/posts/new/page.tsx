import { aiConfigured, getVoice, lineClient, lineUsage, listAccounts, listGroups, loadKey, planItem } from '@kdan-social/core';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseEnv } from '@/lib/supabase';
import Composer from './Composer';

// Full-page, without the sidebar, as in the prototype.
export default async function NewPost({ searchParams }: { searchParams: Promise<{ plan?: string; item?: string }> }) {
  const { user, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const db = getDb();
  // A post the AI assistant proposed; only the asker's own conversation is read.
  const item = sp.plan && /^[0-9a-f-]{36}$/.test(sp.plan) ? await planItem(db, { workspaceId: workspace.id, userId: user.id, messageId: sp.plan, index: Number(sp.item) || 0 }) : null;
  const [groups, accounts, usage, voice] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
    getVoice(db, workspace.id),
  ]);
  return (
    <Composer
      workspace={workspace.name}
      role={role}
      groups={groups.map(({ id, name }) => ({ id, name }))}
      accounts={accounts.map(({ id, groupId, timeZone, platform, name, status }) => ({ id, groupId, timeZone, platform, name, status }))}
      supabase={supabaseEnv()}
      aiReady={aiConfigured()}
      banned={voice.banned}
      lineUsage={usage.map(({ accountId, quota, audience, error }) => ({ accountId, quota, audience, error }))}
      start={item ? { accountIds: item.accountIds.filter((id) => accounts.some((a) => a.id === id)), main: item.body, date: item.date, time: item.time } : undefined}
    />
  );
}
