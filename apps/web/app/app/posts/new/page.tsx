import { lineClient, lineUsage, listAccounts, listGroups, loadKey } from '@kdan-social/core';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseEnv } from '@/lib/supabase';
import Composer from './Composer';

// Full-page, without the sidebar, as in the prototype.
export default async function NewPost() {
  const { workspace, role } = await requireWorkspace();
  const db = getDb();
  const [groups, accounts, usage] = await Promise.all([
    listGroups(db, workspace.id),
    listAccounts(db, workspace.id),
    lineUsage(db, loadKey(), lineClient(), { workspaceId: workspace.id }),
  ]);
  return (
    <Composer
      workspace={workspace.name}
      role={role}
      groups={groups.map(({ id, name }) => ({ id, name }))}
      accounts={accounts.map(({ id, groupId, timeZone, platform, name, status }) => ({ id, groupId, timeZone, platform, name, status }))}
      supabase={supabaseEnv()}
      lineUsage={usage.map(({ accountId, quota, audience, error }) => ({ accountId, quota, audience, error }))}
    />
  );
}
