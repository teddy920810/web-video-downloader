import { z } from 'zod';

const metaSchema = z.object({ title: z.string().min(1), description: z.string().min(1).max(180) });
const heroSchema = z.object({ eyebrow: z.string().min(1), heading: z.string().min(1), accent: z.string().min(1), intro: z.string().min(1) });
const toolCardSchema = z.object({ number: z.string().min(1), title: z.string().min(1), description: z.string().min(1), linkLabel: z.string().min(1), href: z.string().min(1) });
const pageSchema = z.object({ meta: metaSchema, hero: heroSchema, notesEyebrow: z.string().min(1), notesHeading: z.string().min(1), notes: z.array(z.string().min(1)).min(1) });

export const localMediaToolCopySchema = z.object({
  privateLabel: z.string().min(1),
  converterHeading: z.string().min(1),
  compressorHeading: z.string().min(1),
  chooseFile: z.string().min(1),
  formatHelp: z.string().min(1),
  outputFormatLabel: z.string().min(1),
  compressionLevelLabel: z.string().min(1),
  mp4Label: z.string().min(1), webmLabel: z.string().min(1), mp3Label: z.string().min(1),
  smallLabel: z.string().min(1), balancedLabel: z.string().min(1), qualityLabel: z.string().min(1),
  loadingLabel: z.string().min(1), processingLabel: z.string().min(1), cancelLabel: z.string().min(1),
  convertLabel: z.string().min(1), compressLabel: z.string().min(1), saveLabel: z.string().min(1),
  privacyLabel: z.string().min(1),
});

export const utilitiesSettingsSchema = z.object({
  home: z.object({
    meta: metaSchema,
    hero: heroSchema,
    tools: z.array(toolCardSchema).min(2),
    privacyEyebrow: z.string().min(1),
    privacyHeading: z.string().min(1),
    privacyBody: z.string().min(1),
  }),
  converter: pageSchema,
  compressor: pageSchema,
  tool: localMediaToolCopySchema,
});

export type UtilitiesSettings = z.infer<typeof utilitiesSettingsSchema>;
export type LocalMediaToolCopy = z.infer<typeof localMediaToolCopySchema>;
