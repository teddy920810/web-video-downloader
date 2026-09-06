import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { z } from 'zod';
import { isAdminEmail } from '../../../lib/admin';
import { getSession } from '../../../lib/auth';
import { json } from '../../../lib/api/response';
import { getCreditService } from '../../../lib/credits/services';
import { accountStore } from '../../../lib/account/store';
import { createCodeSchema, disableCodeSchema, profileSchema, rewardSchema } from '../../../lib/account/contracts';

export const prerender = false;
export const ALL: APIRoute = async ({ request, params }) => {
  const action = params.action;
  if (!['overview', 'profile', 'redeem', 'codes', 'disable-code'].includes(action ?? '')) return json({ error: 'Not found.' }, { status: 404 });
  const method = request.method;
  if (!(method === 'GET' && ['overview', 'codes'].includes(action!)) && !(method === 'POST' && action !== 'overview')) {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }
  if (method === 'POST' && (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json'))) {
    return json({ error: 'Same-origin JSON request required.' }, { status: 403 });
  }
  try {
    const session = await getSession(request);
    if (!session?.user.id || !session.user.email) return json({ error: 'Sign in with Google to manage your account.' }, { status: 401 });
    const admin = isAdminEmail(session.user.email, getSecret('ADMIN_EMAILS'));
    if (['codes', 'disable-code'].includes(action!) && !admin) return json({ error: 'Not found.' }, { status: 404 });
    const credits = getCreditService();
    const account = await credits.getOrCreateAccount(session.user);
    if (method === 'GET') {
      if (action === 'codes') return json(await accountStore.codes());
      const [details, usage] = await Promise.all([accountStore.details(session.user.id), credits.listUsage(session.user.id)]);
      return json({ account, ...details, usage, canGrantTestCredits: admin });
    }
    // Bound streamed request bytes before parsing (Content-Length alone is not reliable).
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'A JSON body is required.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 4096) { await reader.cancel(); return json({ error: 'Request is too large.' }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (action === 'profile') {
      await accountStore.profile(session.user.id, profileSchema.parse(body));
      return json({ saved: true });
    }
    if (action === 'redeem') {
      const result = await accountStore.redeem(session.user.id, rewardSchema.parse(body).code);
      return json(result, { status: result.outcome === 'rate_limited' ? 429 : 200 });
    }
    if (action === 'codes') return json(await accountStore.createCode(session.user.id, createCodeSchema.parse(body)));
    return json({ disabled: await accountStore.disableCode(disableCodeSchema.parse(body).id) });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: 'Please check the supplied values.' }, { status: 400 });
    return json({ error: 'Unable to update your account right now. Please try again.' }, { status: 503 });
  }
};
