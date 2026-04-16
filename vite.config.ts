import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

/** Inject a unique build hash into sw-template.js → dist/sw.js */
function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    closeBundle() {
      const tpl = path.resolve(__dirname, 'public/sw-template.js');
      const out = path.resolve(__dirname, 'dist/sw.js');
      if (fs.existsSync(tpl)) {
        const content = fs.readFileSync(tpl, 'utf-8')
          .replace('__BUILD_HASH__', Date.now().toString(36));
        fs.writeFileSync(out, content);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      build: {
        sourcemap: true,
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        swVersionPlugin(),
        // Upload source maps to Sentry on production builds
        env.SENTRY_AUTH_TOKEN
          ? sentryVitePlugin({
              org: env.SENTRY_ORG || 'make-my-reels',
              project: env.SENTRY_PROJECT || 'dashboard',
              authToken: env.SENTRY_AUTH_TOKEN,
            })
          : null,
      ].filter(Boolean),
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
