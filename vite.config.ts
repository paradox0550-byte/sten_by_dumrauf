/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  optimizeDeps: { include: ['@xyflow/react', '@xyflow/system'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 900,
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('/@xyflow/')) return 'vendor-flow';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
          if (id.includes('/xlsx/') || id.includes('/jspdf/')) return 'vendor-export';
          if (id.includes('/@tanstack/react-query/')) return 'vendor-query';
          return undefined;
        },
      },
    },
  },
  server: { port: 3000, host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
