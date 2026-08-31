import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { neon } from '@neondatabase/serverless';
import { json } from '../../../lib/api/response';
import { isAdminEmail } from '../../../lib/admin';
import { getSession } from '../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user.email || !isAdminEmail(session.user.email, getSecret('ADMIN_EMAILS'))) return json({ error: 'Not found.' }, { status: 404 });
  const databaseUrl = getSecret('DATABASE_URL');
  if (!databaseUrl) return json({ error: 'Account reporting is not configured.' }, { status: 503 });
  const rows = await neon(databaseUrl)`SELECT
    (SELECT COUNT(*)::int FROM tool_accounts) AS accounts,
    (SELECT COUNT(*)::int FROM tool_usage WHERE created_at >= NOW() - INTERVAL '30 days') AS "usage30d",
    (SELECT COALESCE(SUM(credits), 0)::int FROM tool_usage WHERE status = 'succeeded' AND created_at >= NOW() - INTERVAL '30 days') AS "credits30d"`;
  return json(rows[0] ?? { accounts: 0, usage30d: 0, credits30d: 0 });
};
