import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Refresh the Supabase session on every page load and keep signed-out and signed-in visitors on the right side of /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // Signed-in people opening the sign-in or sign-up page go on: to the invite they carry, or the app.
  if (data.user && (path === '/login' || path === '/signup')) {
    const invite = request.nextUrl.searchParams.get('invite');
    const to = request.nextUrl.clone();
    to.pathname = invite ? `/invite/${invite}` : '/app';
    to.search = '';
    return NextResponse.redirect(to);
  }
  if (!data.user && (path.startsWith('/app') || path === '/welcome' || path.startsWith('/onboarding'))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Cron and OAuth callbacks authenticate themselves; static assets need no session.
  matcher: ['/((?!api/cron|_next/static|_next/image|favicon.ico).*)'],
};
