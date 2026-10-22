import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
import { createApp } from './app.js';

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Denne enkeltbrukerklienten må bindes til loopback. Bruk lokal kjøring eller SSH-tunnel.');
const app = createApp({ origin: process.env.APP_ORIGIN || `http://localhost:${port}`, dev });
let vite;
if (dev) {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny' }));
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
const server = app.listen(port, host, () => console.log(`Testklient: http://localhost:${port} · Helsenorge test02`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  await vite?.close(); server.close(() => process.exit(0));
});
