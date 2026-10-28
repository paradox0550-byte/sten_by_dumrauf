/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function deferInitialStylesheet(): Plugin {
  return {
    name: 'sten-defer-initial-stylesheet',
    apply: 'build',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset' || typeof html.source !== 'string') return;
      html.source = html.source.replace(
        /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/g,
        (_tag, href: string) => '<link rel="preload" as="style" href="' + href + '" onload="this.onload=null;this.rel=\\'stylesheet\\'"><noscript><link rel="stylesheet" href="' + href + '"></noscript>',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), deferInitialStylesheet()],
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
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
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) return 'vendor-charts';
          return undefined;
        },
      },
    },
  },
  // Keep the development server local by default; opt in to LAN access explicitly.
  server: { port: 3000, host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
