import { z } from 'zod';
import { TOOLS } from '../product/catalog';

const text = z.string().trim().min(1);
const section = { heading: text, intro: text };
export const toolGuideSchema = z.object({
  toolId: text.refine((id) => TOOLS.some((tool) => tool.id === id), 'Unknown tool'),
  features: z.object({ ...section, items: z.array(z.object({
    eyebrow: text, title: text, description: text,
    facts: z.array(z.object({ label: text, value: text })).min(2).max(4),
  })).min(2).max(4) }),
  steps: z.object({ ...section, items: z.array(z.object({ title: text, body: text })).length(3) }),
  faq: z.object({ heading: text, items: z.array(z.object({ question: text, answer: text })).min(3).max(10) }),
});
