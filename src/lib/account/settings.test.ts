import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { accountSettingsSchema } from './settings';
describe('account CMS', () => {
  it('supports an optional real support email and editable categorized FAQ', () => {
    const settings = accountSettingsSchema.parse(JSON.parse(readFileSync(new URL('../../content/settings/account.json', import.meta.url), 'utf8')));
    expect(settings.faq.length).toBeGreaterThan(0);
    expect(accountSettingsSchema.safeParse({ ...settings, supportEmail: 'not-an-email' }).success).toBe(false);
    const cms = parse(readFileSync(new URL('../../../.pages.yml', import.meta.url), 'utf8'));
    expect(cms.content.find((item: { name: string }) => item.name === 'account-settings').fields.map((item: { name: string }) => item.name)).toEqual(['supportEmail', 'faq']);
  });
});
