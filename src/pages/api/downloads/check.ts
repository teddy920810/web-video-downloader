import type { APIRoute } from 'astro';
import { z } from 'zod';
import { inspectDownloadUrl } from '../../../lib/download/policy';
import { json, readJson } from '../../../lib/api/response';

export const prerender = false;

const requestSchema = z.object({ url: z.string().min(1).max(4_000) }).strict();

export const POST: APIRoute = async ({ request }) => {
  let url: string;
  try {
    ({ url } = requestSchema.parse(await readJson(request)));
  } catch {
    return json({ error: 'Please enter a valid HTTPS URL.' }, { status: 400 });
  }

  const result = inspectDownloadUrl(url);
  if (!result.ok) return json({ error: result.message }, { status: 400 });
  return json({ platform: result.platform, url: result.url });
};
