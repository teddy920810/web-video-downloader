export type SiteMode = 'downloader' | 'utilities';

type ModeResolutionOptions = {
  production: boolean;
  localOverride?: unknown;
  readRemote?: () => Promise<unknown>;
};

type CachedModeOptions = ModeResolutionOptions & {
  ttlMs?: number;
  now?: () => number;
};

export function parseSiteMode(value: unknown): SiteMode | null {
  return value === 'downloader' || value === 'utilities' ? value : null;
}

export async function resolveSiteMode(options: ModeResolutionOptions): Promise<SiteMode> {
  if (!options.production) return parseSiteMode(options.localOverride) ?? 'downloader';
  if (!options.readRemote) return 'utilities';
  try {
    return parseSiteMode(await options.readRemote()) ?? 'utilities';
  } catch {
    return 'utilities';
  }
}

export function createSiteModeResolver(options: CachedModeOptions): () => Promise<SiteMode> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 2_000;
  let cached: { value: SiteMode; expiresAt: number } | null = null;
  let pending: Promise<SiteMode> | null = null;

  return async () => {
    const timestamp = now();
    if (cached && timestamp < cached.expiresAt) return cached.value;
    if (pending) return pending;
    pending = resolveSiteMode(options).then((value) => {
      cached = { value, expiresAt: now() + ttlMs };
      return value;
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
}
