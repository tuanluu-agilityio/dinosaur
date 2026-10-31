import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import tslOperatorPlugin from 'vite-plugin-tsl-operator';

const devPages = Object.fromEntries(
  readdirSync(resolve(import.meta.dirname, 'dev'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [`dev-${f.replace('.html', '')}`, resolve(import.meta.dirname, 'dev', f)]),
);

export default defineConfig({
  base: '/dinosaur/',
  plugins: [tslOperatorPlugin({ logs: false })],
  build: {
    target: 'esnext',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), ...devPages } },
  },
  server: { port: 5173 },
});
