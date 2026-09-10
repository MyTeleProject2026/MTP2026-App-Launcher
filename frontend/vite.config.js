import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildCommit = process.env.RENDER_GIT_COMMIT || process.env.VITE_BUILD_COMMIT || 'unknown';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mtp-build-info',
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
  // Vite 8 uses Oxc for JavaScript transforms. Keep the existing .js
  // launcher modules intact because several of them contain JSX.
  // The previous esbuild loader setting is deprecated and is ignored by
  // Oxc's parser, which caused launcherPlatform.js to fail at build time.
  oxc: {
    include: /src\/.*\.js$/,
    jsx: {
      runtime: 'classic'
    }
  },
  server: { port: 5173 }
});
