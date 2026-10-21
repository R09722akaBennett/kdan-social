'use server';

import { listMemberships, markRead, AccessError, AiError, cancelPost, createWorkspaceForUser, dismissOnboarding, updateWorkspaceSettings, WorkspaceError, importAccountPosts, listAccounts, aiInsights, aiSamples, changeRole, aiWriter, commentOnPost, ComposeError, completeMetaConnect, ConnectError, connectLine, decidePost, deleteGroup, globalPublishingEnabled, GroupError, inviteMember, lineClient, loadKey, mask, MemberError, queueDryRunTest, removeMember, revokeInvite, ReviewError, saveGroup, saveVoice, setAccountTimeZone, setPublishing, VoiceError, type GroupVoice, type Voice } from '@kdan-social/core';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { rememberWorkspace, requireUser, requireWorkspace } from '@/lib/auth';
import { deps, getDb, signupCodes } from '@/lib/server';
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
  // Read the new accounts' last 60 days of posts once the response is out, so analytics
  // has history right away instead of after the first nightly run.
  after(async () => {
    const ids = (await listAccounts(getDb(), workspace.id)).filter((a) => a.platform !== 'line' && a.status === 'active').map((a) => a.id);
    const summary = await importAccountPosts({ ...deps(), accountIds: ids, log: (line) => console.log(line) });
    console.log(`Imported ${summary.posts} post(s) from ${summary.accounts} account(s) after connecting, ${summary.failed} failed`);
  });
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
  if (enable && formData.get('confirm') !== 'on') redirect(`/app/settings?error=${encodeURIComponent('開啟前請先勾選確認。')}`);
  try {
    await setPublishing(getDb(), { workspaceId: workspace.id, enabled: enable, actor: user.email, role });
  } catch (e) {
    if (e instanceof ComposeError) redirect(`/app/settings?error=${encodeURIComponent('只有工作區擁有者可以切換對外發文。')}`);
    throw e;
  }
  revalidatePath('/app');
  redirect(`/app/settings?notice=${encodeURIComponent(enable ? '已開啟對外發文：之後到時間的貼文會真的發出。' : '已關閉對外發文：之後到時間的貼文只會記錄為 dry-run。')}`);
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

/** Decide on a post under review, or just comment on it, then return to that post. */
export async function reviewAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  const postId = String(formData.get('postId'));
  const intent = String(formData.get('intent'));
  const comment = String(formData.get('comment') ?? '');
  const back = (q: string) => redirect(`/app/approvals?post=${encodeURIComponent(postId)}&${q}`);
  let notice: string;
  try {
    if (intent === 'approve' || intent === 'request_changes') {
      await decidePost(getDb(), { workspaceId: workspace.id, postId, decision: intent, comment, actor: user.email, role });
      notice = intent === 'approve' ? '已核准，貼文會在排定的時間發出' : '已退回，請送審人依留言修改';
    } else {
      await commentOnPost(getDb(), { workspaceId: workspace.id, postId, body: comment, actor: user.email });
      notice = '已留言';
    }
  } catch (e) {
    if (e instanceof ReviewError) back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app', 'layout');
  back(`notice=${encodeURIComponent(notice)}`);
}

/** Run a member change and return to the members page, showing a refusal as the page's error. */
async function memberChange(run: () => Promise<unknown>, notice: string) {
  try {
    await run();
  } catch (e) {
    if (e instanceof MemberError) redirect(`/app/members?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app/members');
  redirect(`/app/members?notice=${encodeURIComponent(notice)}`);
}

export async function inviteAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  const email = String(formData.get('email') ?? '');
  await memberChange(
    () => inviteMember(getDb(), { workspaceId: workspace.id, email, role: String(formData.get('role')), actor: user.email, actorRole: role }),
    `已邀請 ${email.trim().toLowerCase()}，請對方用這個 email 登入`,
  );
}

export async function revokeInviteAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  await memberChange(() => revokeInvite(getDb(), { workspaceId: workspace.id, inviteId: String(formData.get('inviteId')), actor: user.email, actorRole: role }), '已撤回邀請');
}

export async function changeRoleAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  await memberChange(
    () => changeRole(getDb(), { workspaceId: workspace.id, userId: String(formData.get('userId')), role: String(formData.get('role')), actor: user.email, actorId: user.id, actorRole: role }),
    '已更新角色',
  );
}

export async function removeMemberAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  await memberChange(() => removeMember(getDb(), { workspaceId: workspace.id, userId: String(formData.get('userId')), actor: user.email, actorId: user.id, actorRole: role }), '已移除成員');
}

export async function saveVoiceAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  let payload: { voice: Voice; groups: Record<string, GroupVoice> };
  try {
    payload = JSON.parse(String(formData.get('payload')));
  } catch {
    redirect(`/app/voice?error=${encodeURIComponent('送出的資料格式不正確，請重新整理後再試。')}`);
  }
  try {
    await saveVoice(getDb(), { workspaceId: workspace.id, voice: payload.voice, groups: payload.groups, actor: user.email, role });
  } catch (e) {
    if (e instanceof VoiceError) redirect(`/app/voice?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app/voice');
  redirect(`/app/voice?notice=${encodeURIComponent('已儲存，之後 AI 產生的內容會套用新設定')}`);
}

export type SampleResult = { samples?: Array<{ groupId: string | null; name: string; text: string; banned: string[] }>; error?: string };

/** Try the brand voice page's current, possibly unsaved, settings on a topic. */
export async function sampleAction(input: { topic: string; voice: Voice; groups: Array<{ id: string; name: string; voice: GroupVoice }> }): Promise<SampleResult> {
  const { user, workspace } = await requireWorkspace();
  try {
    return { samples: await aiSamples(getDb(), aiWriter(), { workspaceId: workspace.id, actor: user.email, ...input }) };
  } catch (e) {
    if (e instanceof AiError || e instanceof VoiceError) return { error: e.message };
    throw e;
  }
}

export type InsightsResult = { findings?: string[]; error?: string };

/** AI findings from the analytics page's own numbers, on request. */
export async function insightsAction(input: { days: number; groups: string[] }): Promise<InsightsResult> {
  const { user, workspace } = await requireWorkspace();
  const days = [7, 30, 90].includes(input.days) ? input.days : 30;
  try {
    return { findings: await aiInsights(getDb(), aiWriter('insights'), { workspaceId: workspace.id, actor: user.email, days, groupIds: input.groups.map((g) => (g === 'none' ? null : g)) }) };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    throw e;
  }
}

export async function createWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const from = formData.get('from') === '/app/workspaces/new' ? '/app/workspaces/new' : '/app';
  let id: string;
  try {
    ({ id } = await createWorkspaceForUser(getDb(), {
      userId: user.id, email: user.email, codes: signupCodes(),
      name: String(formData.get('name') ?? ''), timeZone: String(formData.get('timeZone') ?? ''), code: String(formData.get('code') ?? ''),
    }));
  } catch (e) {
    if (e instanceof WorkspaceError) redirect(`${from}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  await rememberWorkspace(id);
  revalidatePath('/app', 'layout');
  redirect('/app?notice=workspace_created');
}

export async function switchWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('workspaceId') ?? '');
  // Only a workspace the person belongs to is remembered; anything else keeps the current one.
  if ((await listMemberships(getDb(), user.id)).some((m) => m.id === id)) await rememberWorkspace(id);
  revalidatePath('/app', 'layout');
  redirect('/app');
}

export async function updateSettingsAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  try {
    await updateWorkspaceSettings(getDb(), {
      workspaceId: workspace.id, actor: user.email, role,
      name: String(formData.get('name') ?? workspace.name), timeZone: String(formData.get('timeZone') ?? workspace.timeZone),
      requiresReview: formData.get('requiresReview') === 'on',
    });
  } catch (e) {
    if (e instanceof WorkspaceError) redirect(`/app/settings?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/settings?notice=${encodeURIComponent('已儲存設定')}`);
}

export async function dismissOnboardingAction() {
  const { user, workspace } = await requireWorkspace();
  await dismissOnboarding(getDb(), { workspaceId: workspace.id, actor: user.email });
  revalidatePath('/app');
  redirect('/app');
}

export async function cancelPostAction(formData: FormData) {
  const { user, workspace, role } = await requireWorkspace();
  const postId = String(formData.get('postId'));
  try {
    await cancelPost(getDb(), { workspaceId: workspace.id, postId, actor: user.email, role });
  } catch (e) {
    if (e instanceof ComposeError) redirect(`/app/posts/${postId}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/posts/${postId}?notice=${encodeURIComponent('已取消排程，還沒發出的帳號不會再發')}`);
}

export async function openNotificationAction(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const href = await markRead(getDb(), { workspaceId: workspace.id, userId: user.id, id: String(formData.get('id')) });
  revalidatePath('/app', 'layout');
  // Only follow links into the app; a stored link is never sent off-site.
  redirect(href?.startsWith('/app') ? href : '/app/notifications');
}

export async function markAllReadAction() {
  const { user, workspace } = await requireWorkspace();
  await markRead(getDb(), { workspaceId: workspace.id, userId: user.id });
  revalidatePath('/app', 'layout');
  redirect('/app/notifications');
}

