import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { isAdminEmail } from '../../../lib/admin';
import { json } from '../../../lib/api/response';
import { getSession } from '../../../lib/auth';
import { getCreditService } from '../../../lib/credits/services';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user.id || !session.user.email) return json({ error: 'Sign in with Google to view your account.' }, { status: 401 });
  const credits = getCreditService();
  const account = await credits.getOrCreateAccount({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
  const usage = await credits.listUsage(session.user.id, 20);
  return json({ account, usage, canGrantTestCredits: isAdminEmail(session.user.email, getSecret('ADMIN_EMAILS')) });
};
