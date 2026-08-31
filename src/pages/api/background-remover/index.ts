import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { z } from 'zod';
import { fetchWithPolicy } from '../../../lib/api/service-client';
import { json, readJson } from '../../../lib/api/response';
import { getSession } from '../../../lib/auth';
import { isBackgroundRemovalInput } from '../../../lib/upload/validation';

export const prerender = false;

const requestSchema = z.object({
  jobId: z.uuid(),
  inputKey: z.string().min(1).max(160),
}).strict();

type ServiceResult = {
  jobId?: string;
  status?: string;
  downloadUrl?: string;
  sizeBytes?: number;
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user.id || !session.user.email) {
    return json({ error: 'Sign in with Google to remove an image background.' }, { status: 401 });
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await readJson(request));
    if (!isBackgroundRemovalInput(input.inputKey, input.jobId)) throw new Error('Invalid input key');
  } catch {
    return json({ error: 'The selected image is not valid for this job.' }, { status: 400 });
  }

  const serviceUrl = getSecret('DOWNLOAD_SERVICE_URL');
  const serviceToken = getSecret('DOWNLOAD_SERVICE_TOKEN');
  if (!serviceUrl || !serviceToken) {
    return json({ error: 'The background removal service is not configured yet.' }, { status: 503 });
  }

  try {
    const response = await fetchWithPolicy(new URL('/v1/background-removals', serviceUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Token': serviceToken },
      body: JSON.stringify(input),
    }, { timeoutMs: 45_000 });
    const result = await response.json() as ServiceResult;
    if (!response.ok
      || result.jobId !== input.jobId
      || result.status !== 'ready'
      || typeof result.downloadUrl !== 'string'
      || typeof result.sizeBytes !== 'number') {
      return json({ error: 'Unable to remove the image background right now.' }, { status: response.ok ? 502 : response.status });
    }
    return json(result);
  } catch {
    return json({ error: 'The background removal service is temporarily unavailable.' }, { status: 503 });
  }
};
