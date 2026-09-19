import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSession } from '../../../lib/auth';
import { getCreditService } from '../../../lib/credits/services';
import { json } from '../../../lib/api/response';
import {
  checkoutInput,
  canStartCheckout,
  normalizeEvent,
  verifySignature,
} from '../../../lib/billing/contracts';
import { getBilling } from '../../../lib/billing/runtime';

export const prerender = false;
async function bodyText(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Body required');
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RangeError('Body too large');
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export const ALL: APIRoute = async ({ request, params }) => {
  const action = params.action;
  if (
    !['status', 'checkout', 'webhook', 'cancel', 'portal'].includes(
      action ?? '',
    )
  )
    return json({ error: 'Not found.' }, { status: 404 });
  if (request.method !== (action === 'status' ? 'GET' : 'POST'))
    return json({ error: 'Method not allowed.' }, { status: 405 });
  try {
    const billing = getBilling();
    if (!billing)
      return action === 'status'
        ? json({ enabled: false })
        : json({ error: 'Purchases are not open yet.' }, { status: 503 });
    if (action === 'webhook') {
      const raw = await bodyText(request, 262144);
      if (
        !verifySignature(
          raw,
          request.headers.get('creem-signature'),
          billing.config.webhookSecret,
        )
      )
        return json({ error: 'Invalid signature.' }, { status: 401 });
      const event = normalizeEvent(JSON.parse(raw), billing.config);
      const outcome = await billing.service.apply(event);
      return json({ received: true, outcome });
    }
    if (
      request.method === 'POST' &&
      (request.headers.get('origin') !== new URL(request.url).origin ||
        !request.headers.get('content-type')?.startsWith('application/json'))
    )
      return json(
        { error: 'Same-origin JSON request required.' },
        { status: 403 },
      );
    const session = await getSession(request);
    if (!session?.user.id || !session.user.email)
      return json(
        { error: 'Sign in with Google to manage payments.' },
        { status: 401 },
      );
    await getCreditService().getOrCreateAccount(session.user);
    if (action === 'status')
      return json(await billing.service.summary(session.user.id));
    const input: unknown = JSON.parse(await bodyText(request, 4096));
    if (action === 'checkout') {
      if (!canStartCheckout(billing.config, session.user.email))
        return json({ error: 'Purchases are not open for this account yet.' }, { status: 403 });
      const parsed = checkoutInput.parse(input);
      return json(
        await billing.service.checkout(
          session.user,
          parsed.offer,
          parsed.requestId,
          new URL(request.url).origin,
        ),
      );
    }
    if (action === 'cancel') {
      const parsed = z
        .object({ subscriptionId: z.string().regex(/^sub_[A-Za-z0-9]+$/) })
        .strict()
        .parse(input);
      return json(
        await billing.service.cancel(session.user.id, parsed.subscriptionId),
      );
    }
    z.object({}).strict().parse(input);
    return json(await billing.service.portal(session.user.id));
  } catch (error) {
    if (error instanceof RangeError)
      return json({ error: 'Request is too large.' }, { status: 413 });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json(
        { error: 'Please check the supplied values.' },
        { status: 400 },
      );
    // Never return provider payloads, credentials, raw events, or database errors.
    return json(
      {
        error:
          'Unable to update billing right now. Please retry or contact support.',
      },
      { status: 503 },
    );
  }
};
