export const SUPPORTED_PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
export type DownloadPlatform = SupportedPlatform | 'other';

export type DownloadUrlInspection =
  | { ok: true; platform: DownloadPlatform; url: string }
  | { ok: false; message: string };

const platformHosts: Record<SupportedPlatform, readonly string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
  instagram: ['instagram.com', 'www.instagram.com', 'instagr.am'],
};

function platformForHost(hostname: string): SupportedPlatform | undefined {
  return SUPPORTED_PLATFORMS.find((platform) => platformHosts[platform].includes(hostname));
}

export function inspectDownloadUrl(input: string): DownloadUrlInspection {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, message: 'Please enter a valid HTTPS URL.' };
  }

  if (url.protocol !== 'https:') return { ok: false, message: 'Please enter a valid HTTPS URL.' };
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || /^(127|10|192\.168)\./.test(hostname)) {
    return { ok: false, message: 'Please enter a public HTTPS URL.' };
  }
  const platform = platformForHost(hostname) ?? 'other';

  if (platform === 'youtube' && (url.pathname === '/playlist' || url.searchParams.has('list'))) {
    return { ok: false, message: 'Playlists are not available in the free trial.' };
  }

  return { ok: true, platform, url: url.toString() };
}

export function isDesktopOnly(selection: { durationSeconds: number | null; height: number | null }): boolean {
  return selection.durationSeconds === null || selection.durationSeconds > 600 || (selection.height ?? 0) > 720;
}
