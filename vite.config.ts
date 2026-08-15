import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The Admin Portal (public/admin/index.html) is a static page served at /admin
// and /admin/. Vite neither transforms public/ files nor expands env vars in
// them, and its SPA fallback intercepts extensionless paths — so a middleware
// serves the file directly. Firebase credentials come from the same env that
// the React app gets via `define` below, injected by replacing __FIREBASE_*__
// tokens. The built copy is baked the same way in closeBundle for static hosts.
const FIREBASE_TOKENS: Record<string, string> = {
  __FIREBASE_API_KEY__: 'FIREBASE_API_KEY',
  __FIREBASE_AUTH_DOMAIN__: 'FIREBASE_AUTH_DOMAIN',
  __FIREBASE_DATABASE_URL__: 'FIREBASE_DATABASE_URL',
  __FIREBASE_PROJECT_ID__: 'FIREBASE_PROJECT_ID',
  __FIREBASE_STORAGE_BUCKET__: 'FIREBASE_STORAGE_BUCKET',
  __FIREBASE_MESSAGING_SENDER_ID__: 'FIREBASE_MESSAGING_SENDER_ID',
  __FIREBASE_APP_ID__: 'FIREBASE_APP_ID',
  __FIREBASE_MEASUREMENT_ID__: 'FIREBASE_MEASUREMENT_ID',
};

function injectFirebaseCreds(html: string, env: Record<string, string>): string {
  return Object.entries(FIREBASE_TOKENS).reduce(
    (acc, [token, envKey]) => acc.split('"' + token + '"').join(JSON.stringify(env[envKey] ?? '')),
    html
  );
}

export default defineConfig(({ mode }) => {
    // loadEnv only reads committed .env* files; merge process.env so hosts like
    // Vercel (which injects project env vars during build) get these values too.
    const env: Record<string, string> = {
      ...loadEnv(mode, '.', ''),
      ...(process.env as Record<string, string>),
    };
    const adminFile = path.resolve(__dirname, 'public', 'admin', 'index.html');

    const serveAdmin = (req: any, res: any, next: any) => {
      const url = String(req.url || '').split('?')[0];
      if (url !== '/admin' && url !== '/admin/' && url !== '/admin/index.html') return next();
      if (!fs.existsSync(adminFile)) return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(injectFirebaseCreds(fs.readFileSync(adminFile, 'utf8'), env));
    };

    const adminPortal: Plugin = {
      name: 'admin-portal',
      configureServer(server) {
        server.middlewares.use(serveAdmin);
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveAdmin);
      },
      closeBundle() {
        const distFile = path.resolve(__dirname, 'dist', 'admin', 'index.html');
        if (fs.existsSync(distFile)) {
          fs.writeFileSync(distFile, injectFirebaseCreds(fs.readFileSync(distFile, 'utf8'), env));
        }
      },
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), adminPortal],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        ...Object.fromEntries(
          [
            'FIREBASE_API_KEY',
            'FIREBASE_AUTH_DOMAIN',
            'FIREBASE_DATABASE_URL',
            'FIREBASE_PROJECT_ID',
            'FIREBASE_STORAGE_BUCKET',
            'FIREBASE_MESSAGING_SENDER_ID',
            'FIREBASE_APP_ID',
            'FIREBASE_MEASUREMENT_ID',
          ].map((key) => [`process.env.${key}`, JSON.stringify(env[key])])
        ),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
