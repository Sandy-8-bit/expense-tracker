import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const cookie of cookies) request.cookies.set(cookie.name, cookie.value);
        response = NextResponse.next({ request });
        for (const cookie of cookies)
          response.cookies.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user && request.nextUrl.pathname !== '/login')
    return NextResponse.redirect(new URL('/login', request.url));
  return response;
}
export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/login',
    '/invoices/:path*',
    '/match-payments',
    '/import-statement',
    '/transactions',
    '/expenses',
    '/companies',
    '/categories',
    '/bank-accounts',
    '/reports',
  ],
};
