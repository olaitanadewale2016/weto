import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Preserve ColibriPlus /@username profile URLs without conflicting with Next.js @slot parallel routes
  if (pathname.startsWith('/@')) {
    const rest = pathname.slice(2); // after '/@'
    const url = request.nextUrl.clone();
    url.pathname = `/u/${rest}`;
    return NextResponse.rewrite(url);
  }

  // Redirect /home -> /
  if (pathname === '/home') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Add standard security headers
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/|pwa/|documents/).*)'],
};
