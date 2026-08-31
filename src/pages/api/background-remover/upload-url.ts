import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { parseUploadRequest } from '../../../lib/api/contracts';
import { json, readJson } from '../../../lib/api/response';
import { getServices } from '../../../lib/services';
import { createToolInputKey } from '../../../lib/upload/validation';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user.id || !session.user.email) {
    return json({ error: 'Sign in with Google to remove an image background.' }, { status: 401 });
  }

  let input: ReturnType<typeof parseUploadRequest>;
  try {
    input = parseUploadRequest(await readJson(request));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Choose a valid image.' }, { status: 400 });
  }

  try {
    const jobId = crypto.randomUUID();
    const inputKey = createToolInputKey('background-remover', input.contentType, jobId);
    const uploadUrl = await getServices().objects.createUploadUrl(inputKey, input.contentType);
    return json({ jobId, inputKey, uploadUrl });
  } catch {
    return json({ error: 'Unable to prepare the private upload right now.' }, { status: 503 });
  }
};
