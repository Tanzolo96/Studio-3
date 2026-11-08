import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// `vite build --mode standalone` makes one self-contained HTML file (claude.ai artifact).
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    plugins: [react(), tailwindcss(), ...(standalone ? [viteSingleFile()] : [])],
    define: standalone ? { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') } : {},
    resolve: standalone ? { alias: [{ find: /^\.\/fonts$/, replacement: fileURLToPath(new URL('./src/fonts-none.ts', import.meta.url)) }] } : {},
    build: standalone ? { outDir: 'dist-standalone' } : {},
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  } as never;
});
