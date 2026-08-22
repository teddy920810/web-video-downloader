const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

type RequestPolicy = {
  timeoutMs: number;
  retries?: number;
  signal?: AbortSignal;
};

export async function fetchWithPolicy(
  input: URL | RequestInfo,
  init: RequestInit,
  policy: RequestPolicy,
): Promise<Response> {
  const attempts = (policy.retries ?? 0) + 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), policy.timeoutMs);
    const abort = () => controller.abort(policy.signal?.reason);
    policy.signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === attempts - 1) return response;
      lastError = new Error(`Temporary service response (${response.status}).`);
    } catch (error) {
      lastError = error;
      if (policy.signal?.aborted || attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timeout);
      policy.signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed.');
}
