'use server';

import { AccessError, ComposeError, completeMetaConnect, ConnectError, connectLine, deleteGroup, globalPublishingEnabled, GroupError, lineClient, loadKey, mask, queueDryRunTest, saveGroup, setAccountTimeZone, setPublishing } from '@kdan-social/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

// Server actions are public endpoints: every one re-checks the session and workspace
// itself instead of trusting that only the page's own form can call it.

export async function queueTest(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  try {
    await queueDryRunTest(getDb(), { workspaceId: workspace.id, accountId: String(formData.get('accountId')), globalEnabled: globalPublishingEnabled(), actor: user.email });
  } catch (e) {
    if (e instanceof AccessError) redirect('/app?notice=test_refused');
    throw e;
  }
  revalidatePath('/app');
  redirect('/app?notice=test_queued');
}

export async function saveMetaConnection(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const sessionId = String(formData.get('session'));
  const selections = formData.getAll('page').map((v) => {
    const pageId = String(v);
    return { pageId, instagram: formData.get(`ig:${pageId}`) === 'on' };
  });
  if (selections.length === 0) redirect(`/app/connect/meta?session=${sessionId}&error=none`);
  let connected = 0;
  try {
    ({ connected } = await completeMetaConnect(getDb(), loadKey(), { sessionId, workspaceId: workspace.id, userId: user.id, actor: user.email, selections }));
  } catch (e) {
    if (e instanceof AccessError) redirect('/app?notice=meta_expired');
    throw e;
  }
  revalidatePath('/app');
  redirect(`/app?notice=connected&n=${connected}`);
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function togglePublishing(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  const enable = formData.get('enable') === '1';
  if (enable && formData.get('confirm') !== 'on') redirect('/app?notice=confirm_needed');
  try {
    await setPublishing(getDb(), { workspaceId: workspace.id, enabled: enable, actor: user.email, role });
  } catch (e) {
    if (e instanceof ComposeError) redirect('/app?notice=owner_only');
    throw e;
  }
  revalidatePath('/app');
  redirect(`/app?notice=${enable ? 'publishing_on' : 'publishing_off'}`);
}

export async function connectLineAccount(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  let name = '';
  try {
    ({ name } = await connectLine(getDb(), loadKey(), lineClient(), {
      workspaceId: workspace.id,
      channelId: String(formData.get('channelId') ?? ''),
      channelSecret: String(formData.get('channelSecret') ?? ''),
      actor: user.email,
    }));
  } catch (e) {
    if (e instanceof ConnectError) {
      if (e.cause) console.error(`LINE connect failed for ${user.email}: ${mask(String(e.cause))}`);
      redirect(`/app/connect/line?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  revalidatePath('/app');
  redirect(`/app?notice=line_connected&n=${encodeURIComponent(name)}`);
}

const backToChannels = (q: string) => redirect(`/app/channels?${q}#groups`);

/** Run a group change and return to the accounts page, showing a refusal as the page's error. */
async function groupChange(run: () => Promise<unknown>, notice: string) {
  try {
    await run();
  } catch (e) {
    if (e instanceof GroupError) backToChannels(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app', 'layout');
  backToChannels(`notice=${encodeURIComponent(notice)}`);
}

export async function saveGroupAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  const name = String(formData.get('name') ?? '');
  const groupId = formData.get('groupId') ? String(formData.get('groupId')) : undefined;
  const accountIds = formData.getAll('accountId').map(String);
  await groupChange(
    () => saveGroup(getDb(), { workspaceId: workspace.id, groupId, name, accountIds, actor: user.email, role }),
    groupId ? `已更新群組「${name.trim()}」` : `已建立群組「${name.trim()}」`,
  );
}

export async function deleteGroupAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  await groupChange(
    () => deleteGroup(getDb(), { workspaceId: workspace.id, groupId: String(formData.get('groupId')), actor: user.email, role }),
    '已刪除群組，帳號本身沒有被移除',
  );
}

export async function setTimeZoneAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  const timeZone = String(formData.get('timeZone') ?? '');
  try {
    await setAccountTimeZone(getDb(), { workspaceId: workspace.id, accountId: String(formData.get('accountId')), timeZone, actor: user.email, role });
  } catch (e) {
    if (e instanceof GroupError) redirect(`/app/channels?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/channels?notice=${encodeURIComponent('時區已更新；已排程的貼文維持原本的時間')}`);
}
