import { z } from 'zod';
import { TOOLS } from '../product/catalog';

const text = z.string().trim().min(1);
const section = { heading: text, intro: z.string().trim() };
const localPath = text.regex(/^\/(?!\/)[a-zA-Z0-9/_\-.]+$/);
const localLink = text.regex(/^(?:\/(?!\/)[a-zA-Z0-9/_\-.]+|#[a-zA-Z0-9_-]+)$/);
export const toolGuideSchema = z.object({
  toolId: text.refine((id) => TOOLS.some((tool) => tool.id === id), 'Unknown tool'),
  features: z.object({ ...section, items: z.array(z.object({
    eyebrow: text, title: text, description: text,
    facts: z.array(z.object({ label: text, value: text })).min(2).max(4),
    image: z.object({ src: localPath, alt: text, width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  })).min(2).max(4) }),
  steps: z.object({ ...section, items: z.array(z.object({ title: text, body: text })).length(3) }),
  faq: z.object({ heading: text, items: z.array(z.object({ question: text, answer: text })).min(3).max(10) }),
  supporting: z.array(z.object({ heading: text, items: z.array(z.object({
    title: z.string().trim(), body: text,
    link: z.object({ label: text, href: localLink }).optional(),
  })).min(1) })).optional(),
  finalCta: z.object({ heading: text, body: text, label: text, href: localLink }).optional(),
});
