import { auth, getSession } from '../../../lib/auth';
import { accountAuth, emailCookie, emailToken, sharedAuthEnabled } from '../../../lib/account-auth/runtime';
import { json } from '../../../lib/api/response';
import type { APIRoute } from 'astro';

export const prerender = false;

export const ALL: APIRoute = async (ctx) => {
  if (sharedAuthEnabled()) {
    const path = new URL(ctx.request.url).pathname;
    if (path === '/api/auth/get-session' && ctx.request.method === 'GET') return json(await getSession(ctx.request));
    if (path === '/api/auth/sign-out' && ctx.request.method === 'POST' && emailToken(ctx.request)) {
      if (ctx.request.headers.get('origin') !== new URL(ctx.request.url).origin) return json({ error: 'Same-origin request required.' }, { status: 403 });
      await accountAuth().signOut(emailToken(ctx.request));
      const result = await auth.handler(ctx.request);
      const headers = new Headers(result.headers);
      headers.append('Set-Cookie', emailCookie(ctx.request, '', true));
      return new Response(result.body, { status: result.status, headers });
    }
  }
  return auth.handler(ctx.request);
};
