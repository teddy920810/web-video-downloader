export async function accountRequest<T>(action: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(`/api/account/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.outcome === 'rate_limited' ? 'Too many attempts. Please wait 15 minutes.' : result.error ?? 'Unable to load your account.');
  return result as T;
}
