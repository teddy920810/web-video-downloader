import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: 'billing-user',
          email: 'billing@example.test',
          name: 'Billing test',
        },
        session: { id: 'fixture' },
      },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem('streamnest-consent-v1', 'necessary'),
  );
});
test('starts a selected pack, preserves the retry key, and refreshes confirmed credits after return', async ({
  page,
}) => {
  let attempts = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests: Array<{ offer: string; requestId: string }> = [];
  await page.route('**/api/billing/checkout', async (route) => {
    requests.push(route.request().postDataJSON());
    attempts++;
    await route.fulfill(
      attempts === 1
        ? { status: 503, json: { error: 'Please retry checkout.' } }
        : {
            json: {
              url: 'http://127.0.0.1:4393/account/credits?checkout=returned',
            },
          },
    );
  });
  const account = {
    account: {
      userId: 'billing-user',
      email: 'billing@example.test',
      name: 'Billing test',
      image: null,
      planId: 'free',
      status: 'active',
      freeCredits: 0,
      paidCredits: 0,
    },
    preferences: { nickname: '', marketingOptIn: false },
    usage: [],
    reservedCredits: 0,
    ledger: [],
    redemptions: [],
    canGrantTestCredits: false,
  };
  await page.route('**/api/account/overview', (route) =>
    route.fulfill({ json: account }),
  );
  let confirmed = false;
  await page.route('**/api/billing/status', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: 'test',
        subscriptions: [],
        batches: confirmed
          ? [
              {
                id: 'batch',
                kind: 'pack',
                remaining: 300,
                consumed: 0,
                expiresAt: '2028-09-13T00:00:00Z',
                revokedAt: null,
                refundEligible: true,
              },
            ]
          : [],
      },
    }),
  );
  await page.goto('/pricing');
  await expect(page.locator('.launch-notice')).toContainText('Test mode');
  await page.getByRole('button', { name: 'Test this credit pack' }).click();
  await expect(page.getByRole('alert')).toContainText('retry');
  await page.getByRole('button', { name: 'Test this credit pack' }).click();
  await expect(page).toHaveURL(/account\/credits\?checkout=returned/);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[0].offer).toBe('pack-300');
  expect(errors).toEqual([]);
  await expect(page.getByText('No confirmed purchases yet.')).toBeVisible();
  confirmed = true;
  account.account.paidCredits = 300;
  await page.getByRole('button', { name: 'Refresh payment status' }).click();
  await expect(page.getByText('Credit pack · 300 available')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Request refund for this purchase' }),
  ).toHaveAttribute('href', /^mailto:support@streamnest.io/);
});
test('shows Pro expiry and cancels renewal without removing remaining credits on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/account/overview', (route) =>
    route.fulfill({
      json: {
        account: {
          userId: 'billing-user',
          email: 'billing@example.test',
          name: 'Billing test',
          planId: 'pro',
          status: 'active',
          freeCredits: 0,
          paidCredits: 499,
        },
        preferences: { nickname: '', marketingOptIn: false },
        usage: [],
        reservedCredits: 0,
        ledger: [],
        redemptions: [],
        canGrantTestCredits: false,
      },
    }),
  );
  let status = 'active';
  await page.route('**/api/billing/status', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: 'test',
        subscriptions: [
          { id: 'sub_one', status, periodEnd: '2026-10-13T00:00:00Z' },
        ],
        batches: [
          {
            id: 'batch',
            kind: 'pro',
            remaining: 499,
            consumed: 1,
            expiresAt: '2026-10-13T00:00:00Z',
            revokedAt: null,
            refundEligible: false,
          },
        ],
      },
    }),
  );
  await page.route('**/api/billing/cancel', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      subscriptionId: 'sub_one',
    });
    status = 'scheduled_cancel';
    await route.fulfill({ json: { canceled: true } });
  });
  await page.goto('/account/credits');
  await page
    .getByRole('button', { name: 'Cancel renewal', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Renewal canceled');
  await expect(
    page.getByText('Pro monthly credits · 499 available'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel renewal', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('never describes live purchases as test payments in the account', async ({ page }) => {
  await page.route('**/api/account/overview', route => route.fulfill({ json: {
    account: { userId: 'billing-user', email: 'billing@example.test', name: 'Billing test', planId: 'free', status: 'active', freeCredits: 0, paidCredits: 300 },
    preferences: {}, usage: [], reservedCredits: 0, ledger: [], redemptions: [], canGrantTestCredits: false,
  } }));
  await page.route('**/api/billing/status', route => route.fulfill({ json: { enabled: true, mode: 'live', batches: [], subscriptions: [] } }));
  await page.goto('/account/credits');
  await expect(page.getByText('No confirmed purchases yet.')).toBeVisible();
  await expect(page.getByText(/Test mode · No real charges/)).toHaveCount(0);
});
