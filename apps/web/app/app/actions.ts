'use server';

import { AccessError, ComposeError, completeMetaConnect, ConnectError, connectLine, globalPublishingEnabled, lineClient, loadKey, mask, queueDryRunTest, setPublishing } from '@kdan-social/core';
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
    return { pageId, marketId: String(formData.get(`market:${pageId}`)), instagram: formData.get(`ig:${pageId}`) === 'on' };
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
      marketId: String(formData.get('marketId')),
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
