'use server';

import { acceptInviteLink, saveProfile } from '@kdan-social/core';
import { redirect } from 'next/navigation';
import { rememberWorkspace } from '@/lib/auth';
import { passwordOk } from '@/lib/password';
import { appUrl, getDb } from '@/lib/server';
import { supabaseServer } from '@/lib/supabase';

export type AuthState = { error?: string; email?: string; sent?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase's messages, in words a person can act on; the original goes to the log.
function reason(message: string, status?: number) {
  if (status === 429 || /rate limit/i.test(message)) return '嘗試太多次了，請過幾分鐘再試。';
  if (/invalid login credentials/i.test(message)) return 'Email 或密碼不正確。';
  if (/already registered|already exists/i.test(message)) return '這個 Email 已經註冊過了，請直接登入。';
  if (/email not confirmed/i.test(message)) return '這個 Email 還沒有完成驗證。';
  if (/password/i.test(message)) return '密碼不符合規則，請換一組。';
  return '沒有完成，請稍後再試。';
}

/** Where to go after signing in: the invite being accepted, or the app. */
async function landing(invite: string, user: { id: string; email?: string }) {
  if (invite) {
    const ws = await acceptInviteLink(getDb(), { token: invite, userId: user.id, email: user.email ?? '' });
    if (ws) {
      await rememberWorkspace(ws.id);
      return `/app?notice=${encodeURIComponent(`已加入「${ws.name}」`)}`;
    }
  }
  return '/app';
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const invite = String(formData.get('invite') ?? '');
  if (!EMAIL.test(email) || !password) return { error: '請輸入 Email 和密碼。', email };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error(`Sign-in failed for ${email}: ${error?.message ?? 'no user'}`);
    return { error: reason(error?.message ?? '', error?.status), email };
  }
  redirect(await landing(invite, data.user));
}

/**
 * Create an account and sign straight in, as Buffer does: no confirmation email. That is
 * why invites are links rather than trusted addresses.
 */
export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const invite = String(formData.get('invite') ?? '');
  if (!EMAIL.test(email)) return { error: 'Email 格式不正確。', email };
  if (!passwordOk(password)) return { error: '密碼不符合下面的規則。', email };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    console.error(`Sign-up failed for ${email}: ${error?.message ?? 'no user'}`);
    return { error: reason(error?.message ?? '', error?.status), email };
  }
  // A project that still asks for confirmation returns no session; say so instead of failing quietly.
  if (!data.session) return { error: '帳號已建立，但需要先到信箱點確認連結才能登入。', email };
  await saveProfile(getDb(), { userId: data.user.id, displayName: email.split('@')[0], answers: {} });
  if (invite) redirect(await landing(invite, data.user));
  redirect('/welcome');
}

export async function sendResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!EMAIL.test(email)) return { error: 'Email 格式不正確。', email };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/auth/callback?next=/reset-password` });
  if (error) {
    console.error(`Password reset for ${email} failed: ${error.message}`);
    if (error.status === 429) return { error: reason(error.message, 429), email };
  }
  // The same answer whether or not the address has an account, so the page cannot be used to probe.
  return { sent: email };
}

export async function updatePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get('password') ?? '');
  if (!passwordOk(password)) return { error: '密碼不符合下面的規則。' };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error(`Password update failed: ${error.message}`);
    return { error: /session|jwt|not authenticated/i.test(error.message) ? '這個連結已經失效，請重新申請重設密碼。' : reason(error.message, error.status) };
  }
  redirect(`/app?notice=${encodeURIComponent('密碼已更新')}`);
}

