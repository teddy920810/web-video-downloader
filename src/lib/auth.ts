import { getSecret } from 'astro:env/server';
import { betterAuth } from 'better-auth';
import { accountAuth, emailToken, sharedAuthEnabled } from './account-auth/runtime';

export const auth = betterAuth({
  baseURL: getSecret('BETTER_AUTH_URL'),
  secret: getSecret('BETTER_AUTH_SECRET'),
  socialProviders: {
    google: {
      clientId: getSecret('GOOGLE_CLIENT_ID') as string,
      clientSecret: getSecret('GOOGLE_CLIENT_SECRET') as string,
    },
  },
});

export async function getSession(request: Request) {
  const google = await auth.api.getSession({ headers: request.headers });
  if (!sharedAuthEnabled()) return google;
  const shared = accountAuth();
  const token = emailToken(request);
  if (token) {
    const emailSession = await shared.session(token);
    if (emailSession) return emailSession;
  }
  if (google?.user.emailVerified) {
    const canonical = await shared.link(google.user);
    return { ...google, user: { ...google.user, id: canonical }, session: { ...google.session, userId: canonical } };
  }
  return google;
}
