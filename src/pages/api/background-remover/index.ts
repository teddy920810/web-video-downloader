import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { z } from 'zod';
import { fetchWithPolicy } from '../../../lib/api/service-client';
import { json, readJson } from '../../../lib/api/response';
import { getSession } from '../../../lib/auth';
import { InsufficientCreditsError } from '../../../lib/credits/credit-service';
import { getCreditService } from '../../../lib/credits/services';
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

  const credits = getCreditService();
  await credits.getOrCreateAccount({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
  const startedAt = Date.now();
  let reservation;
  try {
    reservation = await credits.reserve(session.user.id, 'background-remover', input.jobId);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return json({ error: error.message }, { status: 402 });
    return json({ error: 'Unable to verify your AI credit balance right now.' }, { status: 503 });
  }

  let response: Response;
  let result: ServiceResult;
  const refund = async (errorCode: string) => {
    try {
      await credits.fail(reservation, { durationMs: Date.now() - startedAt, errorCode });
      return true;
    } catch {
      return false;
    }
  };
  try {
    response = await fetchWithPolicy(new URL('/v1/background-removals', serviceUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Token': serviceToken },
      body: JSON.stringify(input),
    }, { timeoutMs: 45_000 });
    result = await response.json() as ServiceResult;
  } catch {
    if (!await refund('provider_unavailable')) return json({ error: 'Unable to restore your AI credit automatically. Please contact support before retrying.' }, { status: 503 });
    return json({ error: 'The background removal service is temporarily unavailable.' }, { status: 503 });
  }

  if (!response.ok
    || result.jobId !== input.jobId
    || result.status !== 'ready'
    || typeof result.downloadUrl !== 'string'
    || typeof result.sizeBytes !== 'number') {
    if (!await refund('provider_response')) return json({ error: 'Unable to restore your AI credit automatically. Please contact support before retrying.' }, { status: 503 });
    return json({ error: 'Unable to remove the image background right now.' }, { status: response.ok ? 502 : response.status });
  }

  try {
    await credits.complete(reservation, { sizeBytes: result.sizeBytes, durationMs: Date.now() - startedAt });
  } catch {
    return json({ error: 'The result is ready, but the credit record could not be finalized. Please contact support before retrying.' }, { status: 503 });
  }
  return json(result);
};
