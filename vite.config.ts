import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, readFileSync, existsSync, statSync, cpSync } from 'node:fs';
import type { Plugin } from 'vite';
import tslOperatorPlugin from 'vite-plugin-tsl-operator';

const devPages = Object.fromEntries(
  readdirSync(resolve(import.meta.dirname, 'dev'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [`dev-${f.replace('.html', '')}`, resolve(import.meta.dirname, 'dev', f)]),
);

/** Serves repo-root content/ at <base>content/ in dev and copies it to dist/content/ on build. */
function contentPlugin(): Plugin {
  const root = resolve(import.meta.dirname, 'content');
  const prefix = '/dinosaur/content/';
  return {
    name: 'dino-content',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(prefix)) return next();
        const file = resolve(root, decodeURIComponent(url.slice(prefix.length)));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (existsSync(root)) cpSync(root, resolve(import.meta.dirname, 'dist', 'content'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: '/dinosaur/',
  plugins: [tslOperatorPlugin({ logs: false }), contentPlugin()],
  build: {
    target: 'esnext',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), ...devPages } },
  },
  server: { port: 5173 },
});
