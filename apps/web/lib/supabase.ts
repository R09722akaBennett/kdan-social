import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set');
  return { url, key };
}

/** A Supabase client bound to this request's auth cookies, for server components, actions and routes. */
export async function supabaseServer() {
  const store = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; the proxy refreshes the session for them.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

/**
 * A Supabase client with the secret key, for server-only work such as signing uploads.
 * It bypasses RLS, so it must never reach a browser or act on unchecked input.
 */
export function supabaseAdmin() {
  const { url } = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
