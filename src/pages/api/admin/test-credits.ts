import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { z } from 'zod';
import { isAdminEmail } from '../../../lib/admin';
import { json, readJson } from '../../../lib/api/response';
import { getSession } from '../../../lib/auth';
import { getCreditService } from '../../../lib/credits/services';

export const prerender = false;

const requestSchema = z.object({ idempotencyKey: z.uuid() }).strict();

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user.id || !session.user.email || !isAdminEmail(session.user.email, getSecret('ADMIN_EMAILS'))) {
    return json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const body = requestSchema.parse(await readJson(request));
    const account = await getCreditService().grantTestCredits(session.user.id, 1, body.idempotencyKey);
    return json({ freeCredits: account.freeCredits, paidCredits: account.paidCredits });
  } catch (error) {
    if (error instanceof z.ZodError || (error instanceof Error && error.message === 'Expected application/json')) {
      return json({ error: 'A valid request identifier is required.' }, { status: 400 });
    }
    return json({ error: 'Unable to add a test credit right now.' }, { status: 503 });
  }
};
