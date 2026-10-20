'use server';

import { ComposeError, createPost, reviewDetail, updatePost, type Schedule } from '@kdan-social/core';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth';
import { getDb } from '@/lib/server';
import { supabaseAdmin } from '@/lib/supabase';

/** A one-time URL the browser uploads one JPEG to, straight to storage. */
export async function createImageUpload() {
  const { workspace } = await requireWorkspace();
  const path = `${workspace.id}/${randomUUID()}.jpg`;
  const storage = supabaseAdmin().storage.from('media');
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not sign an upload URL: ${error?.message ?? 'no data'}`);
  return { path: data.path, token: data.token, publicUrl: storage.getPublicUrl(path).data.publicUrl };
}

export type SubmitState = { error?: string };

export async function submitPost(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const { user, workspace, role } = await requireWorkspace();
  let payload: {
    /** Set when an existing post is being changed. */
    postId?: string;
    body: string;
    perAccount?: Record<string, string>;
    accountIds: string[];
    media: Array<{ url: string; previewUrl?: string; alt?: string }>;
    schedule: Schedule | { mode: 'keep' };
    viewerTimeZone: string;
  };
  try {
    payload = JSON.parse(String(formData.get('payload')));
  } catch {
    return { error: '送出的資料格式不正確，請重新整理後再試。' };
  }
  let target: string | null = null;
  // Uploads are signed under the workspace's own folder, so only accept those URLs back.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${workspace.id}/`;
  // An edit may also keep the images the post already has.
  const kept = new Set<string>();
  if (payload.postId) {
    const current = await reviewDetail(getDb(), { workspaceId: workspace.id, postId: payload.postId });
    for (const m of current?.versions[0]?.media ?? []) kept.add(m.url).add(m.previewUrl ?? m.url);
  }
  if (payload.media.some((m) => ![m.url, m.previewUrl ?? m.url].every((u) => u.startsWith(prefix) || kept.has(u)))) return { error: '圖片來源不正確，請重新上傳。' };
  try {
    const { postId, body, perAccount, accountIds, media, schedule, viewerTimeZone } = payload;
    const who = { workspaceId: workspace.id, actor: user.email, role };
    if (postId) {
      const { approved } = await updatePost(getDb(), { ...who, postId, body, perAccount, media, schedule, viewerTimeZone });
      revalidatePath('/app', 'layout');
      // `redirect` throws, so it must stay outside this try; remember where to go.
      target = `/app/approvals?post=${postId}&notice=${encodeURIComponent(approved ? '已儲存，貼文會照排定時間發出' : '已重新送審')}`;
    } else {
      if (schedule.mode === 'keep') return { error: '新貼文要選擇發布時間。' };
      await createPost(getDb(), { ...who, body, perAccount, accountIds, media, schedule, viewerTimeZone });
    }
  } catch (e) {
    if (e instanceof ComposeError) return { error: e.message };
    throw e;
  }
  if (target) redirect(target);
  revalidatePath('/app/calendar');
  redirect('/app/calendar?view=list&created=1');
}
