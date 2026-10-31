import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { attachBrowserAssets } from '../server/browser-assets.js';

const marker = 'SYNTHETIC_PRIVATE_FILE_MUST_NOT_BE_SERVED';
function rawRequest(url, headers) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, res => {
      res.resume();
      res.on('end', () => resolve(res));
    }).on('error', reject);
  });
}
async function fixture(t, dev, withDependency = false) {
  const prefix = path.join(tmpdir(), 'nhn-browser-security-');
  const root = await mkdtemp(prefix);
  let app, vite;
  const server = http.createServer((req, res) => app(req, res));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await vite?.close();
    assert.ok(path.resolve(root).startsWith(prefix));
    await rm(root, { recursive: true, force: true });
  });
  for (const [file, value] of Object.entries({
    'package.json': JSON.stringify({ name: 'browser-security-fixture', private: true, type: 'module' }),
    'index.html': '<div id="root">browser-fixture</div><script type="module" src="/src/main.js"></script>',
    'src/main.js': 'import { value } from "/shared/module.js"; console.log(value);' +
      (withDependency ? 'import { dependency } from "browser-dependency"; console.log(dependency);' : ''),
    'shared/module.js': 'export const value = "shared-fixture";',
    // Let Vite discover and optimize a real dependency. Its cache directory and
    // metadata are optimizer-owned and may be removed or replaced at startup.
    'node_modules/browser-dependency/package.json': JSON.stringify({
      name: 'browser-dependency', version: '1.0.0', type: 'module', exports: './index.js',
    }),
    'node_modules/browser-dependency/index.js': 'export const dependency = "dependency-fixture";',
    'dist/index.html': '<div>built-fixture</div>',
    'dist/assets/main.js': 'console.log("built-script");',
    '.env': marker,
    '.env.local': marker,
    '.git/config': marker,
    'secrets/connection.json': JSON.stringify({ apiKey: marker }),
    'server/internal.js': `export const secret = "${marker}";`,
    'src/private.pem': marker,
    'public/accidental-key.txt': marker,
  })) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
  }
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  app = createApp({ origin: url, dev, client: { status: () => ({ configured: false }) } });
  vite = await attachBrowserAssets(app, { root, dev });
  return { root, url };
}

test('development serves browser modules but never private files, raw imports or filesystem URLs', { timeout: 15000 }, async t => {
  const { root, url } = await fixture(t, true, true);
  let entry;
  for (const [route, expected] of [['/', 'browser-fixture'], ['/src/main.js', '/shared/module.js'],
    ['/shared/module.js', 'shared-fixture'],
    ['/@vite/client', 'injectQuery']]) {
    const response = await fetch(url + route);
    assert.equal(response.status, 200, route);
    const body = await response.text();
    assert.ok(body.includes(expected), route);
    if (route === '/src/main.js') entry = body;
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  // Follow the browser-facing URL emitted by Vite, including its cache version,
  // rather than guessing a filename or fabricating optimizer metadata.
  const dependencyPath = entry.match(/from\s*["']([^"']*\/node_modules\/\.vite\/deps\/browser-dependency\.js\?[^"']+)["']/)?.[1];
  assert.ok(dependencyPath, 'Vite must rewrite the bare import to an optimized dependency');
  const dependencyUrl = new URL(dependencyPath, url);
  assert.equal(dependencyUrl.origin, url);
  assert.ok(dependencyUrl.searchParams.get('v'), 'optimized dependency must have a cache version');
  const dependency = await fetch(dependencyUrl);
  assert.equal(dependency.status, 200, dependencyPath);
  assert.match(dependency.headers.get('content-type'), /javascript/);
  const dependencyBody = await dependency.text();
  assert.ok(dependencyBody.includes('dependency-fixture'));
  assert.ok(!dependencyBody.includes(marker));
  assert.equal(dependency.headers.get('access-control-allow-origin'), null);
  const privatePaths = ['.env', '.env.local', '.git/config', 'secrets/connection.json',
    'server/internal.js', 'src/private.pem', 'public/accidental-key.txt'];
  for (const file of privatePaths) {
    const paths = [`/${file}`, `/@fs/${path.join(root, file).replaceAll('\\', '/')}`];
    for (const route of paths) for (const suffix of ['', '?raw', '?url', '?import']) {
      const response = await fetch(url + route + suffix);
      const body = await response.text();
      // Asset imports may return a URL wrapper; the underlying file must still
      // be denied. Raw imports must never include the file's contents.
      assert.ok([403, 404].includes(response.status) || (suffix === '?import' && /^export default /.test(body)), `${route}${suffix}: ${response.status}`);
      assert.ok(!body.includes(marker), route);
    }
  }
  const encoded = await fetch(`${url}/%73ecrets/connection.json?raw`);
  assert.equal(encoded.status, 403);
  assert.ok(!(await encoded.text()).includes(marker));
});

for (const dev of [true, false]) test(`${dev ? 'development' : 'built'} assets reject foreign origins and DNS rebinding`, async t => {
  const { url } = await fixture(t, dev);
  const route = dev ? '/src/main.js' : '/assets/main.js';
  for (const headers of [{ Origin: 'https://untrusted.example' }, { Origin: 'null' },
    { Origin: 'http://localhost:9876' }, { 'Sec-Fetch-Site': 'cross-site' }, { Host: 'untrusted.example' }]) {
    const response = await rawRequest(url + route, headers);
    assert.equal(response.statusCode, 403, JSON.stringify(headers));
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  const response = await fetch(url + route, { headers: { Origin: url } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
  assert.match(response.headers.get('content-security-policy'), /object-src 'none';/);
  if (!dev) {
    assert.ok(!(response.headers.get('content-security-policy').includes('unsafe-inline')));
    for (const file of ['/secrets/connection.json', '/.env', '/server/internal.js']) {
      const blocked = await fetch(url + file);
      assert.equal(blocked.status, 404);
      assert.ok(!(await blocked.text()).includes(marker));
    }
  }
});
