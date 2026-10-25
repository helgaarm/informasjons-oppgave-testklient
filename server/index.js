import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
import { createApp } from './app.js';
import { createConnectionSettings } from './connection-settings.js';
import { attachBrowserAssets } from './browser-assets.js';

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Denne enkeltbrukerklienten må bindes til loopback. Bruk lokal kjøring eller SSH-tunnel.');
const settings = await createConnectionSettings({ directory: path.join(root, 'secrets') });
const app = createApp({ origin: process.env.APP_ORIGIN || `http://localhost:${port}`, dev,
  client: settings.client, saveSettings: settings.save });
const vite = await attachBrowserAssets(app, { root, dev });
const server = app.listen(port, host);
server.once('listening', () => console.log(`Testklient: http://localhost:${port} · Helsenorge Test01 / Test02`));
server.once('error', async error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Kunne ikke starte: port ${port} er allerede i bruk.\n`
      + `Hvis testklienten allerede kjører, åpne http://localhost:${port}.\n`
      + 'For å starte på nytt: stopp den gamle kjøringen med Ctrl+C i terminalen, og kjør startkommandoen igjen.\n'
      + 'Hvis en annen app bruker porten, velg en annen PORT og tilsvarende APP_ORIGIN i .env.'
    : 'Kunne ikke starte den lokale appserveren. Kontroller vertsnavn og port.');
  await vite?.close();
  process.exit(1);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  await vite?.close(); server.close(() => process.exit(0));
});
