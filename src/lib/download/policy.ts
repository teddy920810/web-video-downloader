export const SUPPORTED_PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export type DownloadUrlInspection =
  | { ok: true; platform: SupportedPlatform; url: string }
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
  const platform = platformForHost(url.hostname.toLowerCase());
  if (!platform) return { ok: false, message: 'This platform is not supported yet.' };

  if (platform === 'youtube' && (url.pathname === '/playlist' || url.searchParams.has('list'))) {
    return { ok: false, message: 'Playlists are not available in the free trial.' };
  }

  return { ok: true, platform, url: url.toString() };
}
