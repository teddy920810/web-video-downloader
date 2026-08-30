import { defineCollection } from 'astro:content';
import { glob, type Loader } from 'astro/loaders';
import { existsSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { homepageSchema } from './lib/content/homepage';
import { siteSettingsSchema } from './lib/content/site-settings';
import { imageSettingsSchema } from './lib/content/image-metadata';
import { blogEntrySchema } from './lib/content/blog-entry';
import { utilitiesSettingsSchema } from './lib/content/utilities-settings';
import { sitemapSettingsSchema } from './lib/content/sitemap-settings';
import {
  blogIndexSettingsSchema,
  landingCommonSettingsSchema,
  legalPageSchema,
  notFoundSettingsSchema,
} from './lib/content/marketing-settings';

function optionalGlob(base: string, pattern: string, extensions: string[], name: string): Loader {
  const directory = new URL(`../${base.replace(/^\.\//, '')}`, import.meta.url);
  const hasEntries = existsSync(directory)
    && readdirSync(directory, { recursive: true }).some((entry) => extensions.some((extension) => String(entry).endsWith(extension)));
  if (hasEntries) return glob({ base, pattern });
  return { name: `empty-${name}`, async load({ store }) { store.clear(); } };
}

const siteSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'site.json' }),
  schema: siteSettingsSchema,
});

const imageSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'images.json' }),
  schema: imageSettingsSchema,
});

const blogIndexSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'blog.json' }),
  schema: blogIndexSettingsSchema,
});

const utilitiesSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'utilities.json' }),
  schema: utilitiesSettingsSchema,
});

const landingCommonSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'landing.json' }),
  schema: landingCommonSettingsSchema,
});

const notFoundSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'not-found.json' }),
  schema: notFoundSettingsSchema,
});

const sitemapSettings = defineCollection({
  loader: glob({ base: './src/content/settings', pattern: 'sitemap.json' }),
  schema: sitemapSettingsSchema,
});

const legalPages = defineCollection({
  loader: glob({ base: './src/content/legal', pattern: '**/*.{md,mdx}' }),
  schema: legalPageSchema,
});

const homepage = defineCollection({
  loader: glob({ base: './src/content/homepage', pattern: '**/*.json' }),
  schema: homepageSchema,
});

const blog = defineCollection({
  loader: optionalGlob('./src/content/blog', '**/*.{md,mdx}', ['.md', '.mdx'], 'blog'),
  schema: blogEntrySchema,
});

const faqItem = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const landingFeatureItemSchema = z.object({
  eyebrow: z.string().min(1),
  heading: z.string().min(1),
  description: z.string().min(1),
  listItems: z.array(z.string().min(1)).default([]),
  image: z.string().min(1),
  imageAlt: z.string().min(1),
  imagePosition: z.enum(['left', 'right']).default('right'),
});

const landingFeaturesSchema = z.object({
  eyebrow: z.string().min(1),
  heading: z.string().min(1),
  intro: z.string().min(1),
  items: z.array(landingFeatureItemSchema).min(1),
});

const landingPages = defineCollection({
  loader: optionalGlob('./src/content/landing-pages', '**/*.json', ['.json'], 'landing-pages'),
  schema: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    description: z.string().min(1),
    eyebrow: z.string().min(1),
    heading: z.string().min(1),
    intro: z.string().min(1),
    benefits: z.array(z.string().min(1)).min(1),
    features: landingFeaturesSchema.optional(),
    faq: z.array(faqItem).min(1),
  }),
});

export const collections = {
  siteSettings,
  imageSettings,
  blogIndexSettings,
  utilitiesSettings,
  landingCommonSettings,
  notFoundSettings,
  sitemapSettings,
  legalPages,
  homepage,
  blog,
  landingPages,
};
