import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { runSmoke } from './public-smoke.mjs';

const origin = 'https://www.streamnest.io';
const response = (body, status = 200, headers = {}) => new globalThis.Response(body, { status, headers });
test('only fixed public GET routes and no credentials, regardless of process secrets', async () => {
  const calls = [];
  const old = process.env.COOKIE;
  process.env.COOKIE = 'must-not-be-sent';
  try {
    const result = await runSmoke(origin, async (url, options) => {
      calls.push({ url, options });
      return response(url.endsWith('/robots.txt') ? 'User-agent: *' : url.endsWith('/sitemap.xml') ? '<urlset></urlset>' : '<html>Streamnest</html>');
    });
    assert.equal(result.status, 'passed');
    assert.deepEqual(calls.map(c => new URL(c.url).pathname), ['/', '/pricing', '/terms', '/privacy', '/refund-policy', '/robots.txt', '/sitemap.xml']);
    for (const { options } of calls) {
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      assert.deepEqual(Object.keys(options.headers), ['accept']);
    }
  } finally { if (old === undefined) delete process.env.COOKIE; else process.env.COOKIE = old; }
});
for (const target of ['https://evil.example/', origin + '/api/downloads/inspect', origin + '/?token=secret']) {
  test('refuses redirect without following it: ' + target, async () => {
    let calls = 0;
    const result = await runSmoke(origin, async () => { calls++; return response('', 302, { location: target }); });
    assert.equal(result.status, 'failed');
    assert.equal(calls, 7);
    assert.ok(result.checks.every(c => c.reason === 'redirect-rejected'));
    assert.ok(!JSON.stringify(result).includes('secret'));
  });
}
test('does not treat generic 200 error page as success', async () => {
  const result = await runSmoke(origin, async () => response('Access denied'));
  assert.equal(result.status, 'failed');
});
test('invalid or credential-bearing origin rejected before requests', async () => {
  for (const input of ['http://www.streamnest.io', 'https://x:y@www.streamnest.io', origin + '/api', origin + '?key=x', 'https://evil.example']) {
    await assert.rejects(() => runSmoke(input, () => assert.fail('unexpected request')));
  }
});
test('request failure is redacted and never marked passed', async () => {
  const result = await runSmoke(origin, async () => { throw new Error('private-token'); });
  assert.equal(result.status, 'failed');
  assert.ok(!JSON.stringify(result).includes('private-token'));
});
