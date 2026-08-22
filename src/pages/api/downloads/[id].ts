import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { getSession } from '../../../lib/auth';
import { json } from '../../../lib/api/response';
import { fetchWithPolicy } from '../../../lib/api/service-client';
import { getTrialForUser, markTrialFailed, markTrialProcessing, markTrialReady } from '../../../lib/trials/trial-store';

export const prerender = false;

type ServiceJob = {
  jobId: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  objectKey?: string;
  downloadUrl?: string;
  sizeBytes?: number;
  error?: string;
  detail?: string;
};

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session?.user.id) return json({ error: 'Sign in with Google to view this download.' }, { status: 401 });
  const jobId = params.id;
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: 'Download job not found.' }, { status: 404 });

  const trial = await getTrialForUser(jobId, session.user.id);
  if (!trial) return json({ error: 'Download job not found.' }, { status: 404 });

  const serviceUrl = getSecret('DOWNLOAD_SERVICE_URL');
  const serviceToken = getSecret('DOWNLOAD_SERVICE_TOKEN');
  if (!serviceUrl || !serviceToken) return json({ error: 'The download service is not configured yet.' }, { status: 503 });

  try {
    const response = await fetchWithPolicy(new URL(`/v1/downloads/${jobId}`, serviceUrl), {
      method: 'GET',
      headers: { 'X-Internal-Service-Token': serviceToken },
    }, { timeoutMs: 5_000, retries: 2 });
    const result = await response.json() as ServiceJob;
    if (!response.ok) return json({ error: result.detail ?? 'Unable to check this download.' }, { status: response.status === 404 ? 404 : 503 });
    if (result.status === 'processing') await markTrialProcessing(jobId);
    if (result.status === 'failed') await markTrialFailed(jobId, result.error ?? 'Unable to prepare this download.');
    if (result.status === 'ready') {
      if (!result.objectKey || !result.downloadUrl || typeof result.sizeBytes !== 'number') {
        return json({ error: 'The download service returned an incomplete result.' }, { status: 502 });
      }
      await markTrialReady(jobId, result.objectKey);
    }
    return json(result);
  } catch {
    return json({ error: 'The download service is temporarily unavailable.' }, { status: 503 });
  }
};
