import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { z } from 'zod';
import { getSession } from '../../../lib/auth';
import { inspectDownloadUrl } from '../../../lib/download/policy';
import { json, readJson } from '../../../lib/api/response';
import { fetchWithPolicy } from '../../../lib/api/service-client';
import { TrialAlreadyUsedError, createTrial, markTrialFailed } from '../../../lib/trials/trial-store';

export const prerender = false;

const requestSchema = z.object({ url: z.string().min(1).max(4_000), formatId: z.string().min(1).max(100) }).strict();

type Inspection = { sourceUrl: string; title: string; formats: Array<{ formatId: string; hasAudio: boolean }> };
type ServiceDownload = { jobId: string; status: 'queued' | 'processing' | 'ready' | 'failed'; detail?: string };

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user.id || !session.user.email) return json({ error: 'Sign in with Google to download this file.' }, { status: 401 });

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await readJson(request));
  } catch {
    return json({ error: 'Choose a valid video format.' }, { status: 400 });
  }
  const checked = inspectDownloadUrl(input.url);
  if (!checked.ok) return json({ error: checked.message }, { status: 400 });

  const serviceUrl = getSecret('DOWNLOAD_SERVICE_URL');
  const serviceToken = getSecret('DOWNLOAD_SERVICE_TOKEN');
  if (!serviceUrl || !serviceToken) return json({ error: 'The download service is not configured yet.' }, { status: 503 });

  let inspection: Inspection;
  try {
    const response = await fetchWithPolicy(new URL('/v1/inspect', serviceUrl), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Token': serviceToken }, body: JSON.stringify({ url: checked.url }) }, { timeoutMs: 12_000, retries: 1 });
    if (!response.ok) return json({ error: 'This link is no longer available for download.' }, { status: 400 });
    inspection = await response.json() as Inspection;
  } catch {
    return json({ error: 'The download service is temporarily unavailable.' }, { status: 503 });
  }
  if (!inspection.formats.some((format) => format.formatId === input.formatId && format.hasAudio)) {
    return json({ error: 'Choose an available format that includes audio.' }, { status: 400 });
  }

  let trial;
  try {
    trial = await createTrial({ userId: session.user.id, userEmail: session.user.email, sourceUrl: inspection.sourceUrl, formatId: input.formatId, title: inspection.title });
  } catch (error) {
    if (error instanceof TrialAlreadyUsedError) return json({ error: 'This account has already used its free trial.' }, { status: 409 });
    return json({ error: 'Unable to reserve your free trial right now.' }, { status: 503 });
  }

  try {
    const response = await fetchWithPolicy(new URL('/v1/downloads', serviceUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Token': serviceToken },
      body: JSON.stringify({ jobId: trial.id, url: inspection.sourceUrl, formatId: input.formatId }),
    }, { timeoutMs: 5_000, retries: 1 });
    const result = await response.json() as ServiceDownload;
    if (!response.ok) throw new Error(result.detail ?? 'Unable to prepare the selected file.');
    return json({ jobId: trial.id, status: result.status }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to prepare the selected file.';
    await markTrialFailed(trial.id, message);
    return json({ error: message }, { status: 502 });
  }
};
