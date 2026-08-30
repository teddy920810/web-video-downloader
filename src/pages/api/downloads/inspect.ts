import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { z } from 'zod';
import { inspectDownloadUrl } from '../../../lib/download/policy';
import { json, readJson } from '../../../lib/api/response';
import { fetchWithPolicy } from '../../../lib/api/service-client';

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

  const serviceUrl = getSecret('DOWNLOAD_SERVICE_URL');
  const serviceToken = getSecret('DOWNLOAD_SERVICE_TOKEN');
  if (!serviceUrl || !serviceToken) {
    return json({ error: 'The analysis service is not configured yet.' }, { status: 503 });
  }

  try {
    const response = await fetchWithPolicy(new URL('/v1/inspect', serviceUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Token': serviceToken },
      body: JSON.stringify({ url: result.url }),
    }, { timeoutMs: 45_000 });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = typeof body === 'object' && body !== null && 'detail' in body ? (body as { detail?: unknown }).detail : undefined;
      return json({ error: typeof error === 'string' ? error : 'Unable to analyze this link. Please try again.' }, { status: response.status === 400 ? 400 : 503 });
    }
    return json(body);
  } catch {
    return json({ error: 'The analysis service is temporarily unavailable.' }, { status: 503 });
  }
};
