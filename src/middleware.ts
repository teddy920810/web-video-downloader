import type { MiddlewareHandler } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { getSiteMode } from './lib/config/site-mode-server';
import type { SiteMode } from './lib/config/site-mode';

type ModeReader = () => Promise<SiteMode>;

export function createModeMiddleware(readMode: ModeReader): MiddlewareHandler {
  return async (context, next) => {
    const mode = await readMode();
    context.locals.siteMode = mode;
    if (mode === 'utilities' && (
      context.url.pathname === '/api/downloads'
      || context.url.pathname.startsWith('/api/downloads/')
    )) {
      return Response.json({ error: 'Not found.' }, {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (mode === 'utilities' && (
      context.url.pathname === '/blog'
      || context.url.pathname.startsWith('/blog/')
    )) {
      const rendered = await context.rewrite('/404');
      return new Response(rendered.body, {
        status: 404,
        headers: rendered.headers,
      });
    }
    const response = await next();
    if (mode === 'utilities') response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}

export const onRequest = defineMiddleware(createModeMiddleware(getSiteMode));
