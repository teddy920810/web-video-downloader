import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { TextDecoder } from 'node:util';

// Deliberately fixed to the canonical origin verified in Streamnest site.json.
// Do not add API, auth, account, media, checkout or processing routes here.
const canonical = 'https://www.streamnest.io';
const routes = [
  ['/', /Streamnest/i], ['/pricing', /Streamnest/i], ['/terms', /Streamnest/i],
  ['/privacy', /Streamnest/i], ['/refund-policy', /Streamnest/i],
  ['/robots.txt', /User-agent\s*:/i], ['/sitemap.xml', /<(?:urlset|sitemapindex)\b/i],
];

export async function runSmoke(origin = canonical, request = globalThis.fetch) {
  const parsed = new URL(origin);
  if (parsed.origin !== canonical || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
    throw new Error('Expected the approved Streamnest canonical origin only.');
  const checks = [];
  for (const [path, marker] of routes) {
      const controller = new globalThis.AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await request(canonical + path, {
        method: 'GET', redirect: 'manual', credentials: 'omit',
        headers: { accept: 'text/html,text/plain,application/xml,text/xml' }, signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        checks.push({ path, status: 'failed', http: res.status, reason: 'redirect-rejected' });
        continue;
      }
      if (res.status !== 200) {
        await res.body?.cancel();
        checks.push({ path, status: 'failed', http: res.status, reason: 'http-status' });
        continue;
      }
      const reader = res.body?.getReader();
      let size = 0;
      let body = '';
      const decoder = new TextDecoder();
      if (reader) {
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('body-limit'); }
            body += decoder.decode(next.value, { stream: true });
          }
          body += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      const passed = marker.test(body);
      checks.push({ path, status: passed ? 'passed' : 'failed', http: res.status, ...(passed ? {} : { reason: 'content-marker' }) });
    } catch {
      checks.push({ path, status: 'failed', reason: 'request-or-body-failed' });
    } finally { clearTimeout(timeout); }
  }
  return {
    schemaVersion: 1, origin: canonical, checkedAt: new Date().toISOString(),
    status: checks.every(c => c.status === 'passed') ? 'passed' : 'failed', checks,
    scope: 'Public HTTP availability and minimal content markers only',
    excluded: ['deployment SHA identity', 'OAuth', 'payment', 'credits', 'R2', 'processing', 'browser rendering'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSmoke(process.argv[2] ?? canonical);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.status === 'passed' ? 0 : 1;
  } catch { process.stderr.write('Invalid public smoke configuration.\n'); process.exitCode = 2; }
}
