import type { APIRoute } from 'astro';
import { buildRobotsText } from '../lib/content/mode-public-content';

export const prerender = false;
export const GET: APIRoute = ({ site, locals }) => {
  if (!site) throw new Error('Astro site URL is required to generate robots.txt.');
  return new Response(buildRobotsText(locals.siteMode, site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

