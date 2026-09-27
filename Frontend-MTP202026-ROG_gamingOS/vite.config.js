import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildCommit = process.env.RENDER_GIT_COMMIT || process.env.VITE_BUILD_COMMIT || 'unknown';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mtp-build-info',
      transformIndexHtml(html) {
        return html.replace('</head>', '<script type="module" src="/src/networkResilience.js"></script><script type="module" src="/src/systemBootExperience.js"></script></head>');
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify({
            service: 'MTP2026 App Launcher',
            commit: buildCommit,
            builtAt: new Date().toISOString()
          }, null, 2)
        });
      }
    }
  ],
  oxc: {
    include: /src\/.*\.js$/,
    jsx: {
      runtime: 'classic'
    }
  },
  server: { port: 5173 }
});
