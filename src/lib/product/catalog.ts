import type { SiteMode } from '../config/site-mode';

export type ToolId =
  | 'video-converter'
  | 'video-compressor'
  | 'video-trimmer'
  | 'video-merger'
  | 'audio-extractor'
  | 'video-to-gif'
  | 'image-converter'
  | 'image-compressor'
  | 'image-resizer'
  | 'svg-to-image'
  | 'background-remover';

export type ToolDefinition = {
  id: ToolId;
  label: string;
  route: `/${string}`;
  category: 'video' | 'audio' | 'image';
  processing: 'local' | 'cloud';
  credits: number;
};

export const TOOLS: readonly ToolDefinition[] = [
  { id: 'video-converter', label: 'Video Converter', route: '/video-converter', category: 'video', processing: 'local', credits: 0 },
  { id: 'video-compressor', label: 'Video Compressor', route: '/video-compressor', category: 'video', processing: 'local', credits: 0 },
  { id: 'video-trimmer', label: 'Video Trimmer', route: '/video-trimmer', category: 'video', processing: 'local', credits: 0 },
  { id: 'video-merger', label: 'Video Merger', route: '/video-merger', category: 'video', processing: 'local', credits: 0 },
  { id: 'audio-extractor', label: 'Audio Extractor', route: '/audio-extractor', category: 'audio', processing: 'local', credits: 0 },
  { id: 'video-to-gif', label: 'Video to GIF', route: '/video-to-gif', category: 'video', processing: 'local', credits: 0 },
  { id: 'image-converter', label: 'Image Converter', route: '/image-converter', category: 'image', processing: 'local', credits: 0 },
  { id: 'image-compressor', label: 'Image Compressor', route: '/image-compressor', category: 'image', processing: 'local', credits: 0 },
  { id: 'image-resizer', label: 'Image Resizer', route: '/image-resizer', category: 'image', processing: 'local', credits: 0 },
  { id: 'svg-to-image', label: 'SVG to Image', route: '/svg-to-image', category: 'image', processing: 'local', credits: 0 },
  { id: 'background-remover', label: 'Background Remover', route: '/background-remover', category: 'image', processing: 'cloud', credits: 1 },
] as const;

export const TOOL_GROUPS = [
  { id: 'video', label: 'Video tools', tools: TOOLS.filter((tool) => tool.category === 'video') },
  { id: 'audio', label: 'Audio tools', tools: TOOLS.filter((tool) => tool.category === 'audio') },
  { id: 'image', label: 'Image tools', tools: TOOLS.filter((tool) => tool.category === 'image') },
] as const;

export const PRODUCT_PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyCredits: 1,
    maxLocalFileBytes: 250 * 1024 * 1024,
    checkoutEnabled: false,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyCredits: 100,
    maxLocalFileBytes: 1024 * 1024 * 1024,
    checkoutEnabled: false,
  },
} as const;

export type ProductPlanId = keyof typeof PRODUCT_PLANS;

export function toolsForMode(_mode: SiteMode): readonly ToolDefinition[] {
  return TOOLS;
}

export function getTool(id: ToolId): ToolDefinition {
  const tool = TOOLS.find((entry) => entry.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
