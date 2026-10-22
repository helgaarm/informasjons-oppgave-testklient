import express from 'express';
import path from 'node:path';

// The browser needs only frontend sources and their dependencies. In particular,
// Vite's default workspace-wide file access must not include secrets/ or server/.
export async function attachBrowserAssets(app, { root, dev = false }) {
  if (!dev) {
    app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny' }));
    app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
    return;
  }
  const { createServer } = await import('vite');
  const vite = await createServer({
    root, configFile: false, publicDir: false, envPrefix: [], appType: 'spa',
    server: {
      middlewareMode: true, hmr: false, ws: false, cors: false,
      fs: {
        strict: true,
        allow: ['index.html', 'src', 'shared', 'node_modules'].map(entry => path.join(root, entry)),
        deny: ['**/.git/**', '**/.aws/**', '**/.ssh/**', '**/.codex/**', '**/.agents/**',
          '**/.env*', '**/.npmrc', '**/.netrc', '**/secrets/**', '**/server/**', '**/test-results/**',
          '**/*.{crt,pem,key,jwk,p12,pfx,keystore}', '**/*.{log,sarif}'],
      },
    },
  });
  app.use(vite.middlewares);
  return vite;
}
