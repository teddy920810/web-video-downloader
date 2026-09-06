import { z } from 'zod';
export const accountSettingsSchema = z.object({
  supportEmail: z.union([z.literal(''), z.email()]).default(''),
  faq: z.array(z.object({ category: z.enum(['Account', 'Tools', 'Credits', 'Subscription']), question: z.string().min(1), answer: z.string().min(1) })),
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
