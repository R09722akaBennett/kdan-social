'use server';

import { ComposeError, createPost, type Schedule } from '@kdan-social/core';
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
  let payload: { body: string; overrides: Record<string, string>; accountIds: string[]; media: Array<{ url: string; alt?: string }>; schedule: Schedule; viewerTimeZone: string };
  try {
    payload = JSON.parse(String(formData.get('payload')));
  } catch {
    return { error: '送出的資料格式不正確，請重新整理後再試。' };
  }
  // Uploads are signed under the workspace's own folder, so only accept those URLs back.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${workspace.id}/`;
  if (payload.media.some((m) => !m.url.startsWith(prefix))) return { error: '圖片來源不正確，請重新上傳。' };
  try {
    await createPost(getDb(), { ...payload, workspaceId: workspace.id, actor: user.email, role });
  } catch (e) {
    if (e instanceof ComposeError) return { error: e.message };
    throw e;
  }
  revalidatePath('/app/posts');
  redirect('/app/posts?created=1');
}
