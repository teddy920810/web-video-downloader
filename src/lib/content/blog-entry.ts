import { z } from 'zod';
import { publishedAtSchema } from './published-date';
import { trustedHtmlSchema } from './trusted-html';

export const productAreaSchema = z.enum(['general', 'converter', 'compressor', 'downloader']);
export type ProductArea = z.infer<typeof productAreaSchema>;

export const blogEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  publishedAt: publishedAtSchema,
  updatedAt: publishedAtSchema.optional(),
  readTime: z.string().min(1),
  coverImage: z.string().min(1).optional(),
  coverAlt: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  productArea: productAreaSchema.default('downloader'),
  contentMode: z.enum(['markdown', 'html']).default('markdown'),
  bodyHtml: trustedHtmlSchema.optional(),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
}).superRefine((post, context) => {
  if (post.contentMode === 'html' && !post.bodyHtml) {
    context.addIssue({ code: 'custom', path: ['bodyHtml'], message: 'HTML content is required in HTML mode.' });
  }
});
