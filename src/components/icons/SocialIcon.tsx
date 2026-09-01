import {
  DiscordLogoIcon,
  FacebookLogoIcon,
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
  TiktokLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react';

type SocialPlatform = 'x' | 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'github' | 'discord';

const ICONS = {
  x: XLogoIcon,
  youtube: YoutubeLogoIcon,
  instagram: InstagramLogoIcon,
  tiktok: TiktokLogoIcon,
  facebook: FacebookLogoIcon,
  linkedin: LinkedinLogoIcon,
  github: GithubLogoIcon,
  discord: DiscordLogoIcon,
} as const;

export default function SocialIcon({ platform }: { platform: SocialPlatform }) {
  const Icon = ICONS[platform];
  return <Icon aria-hidden="true" size={20} weight="bold" />;
}
