import { defineConfig } from 'vite';
import path from 'path';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    {
      name: 'copy-files',
      closeBundle() {
        // Copy manifest
        copyFileSync('src/manifest.json', 'dist/manifest.json');
        
        // Copy content styles
        copyFileSync('src/content/styles.css', 'dist/content.css');
        
        // Copy polyfill for service worker
        copyFileSync('node_modules/webextension-polyfill/dist/browser-polyfill.min.js', 'dist/browser-polyfill.js');
        
        // Copy icons
        const icons = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];
        icons.forEach(icon => {
          copyFileSync(`public/icons/${icon}`, `dist/${icon}`);
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html',
        background: 'src/background/service-worker.ts',
        content: 'src/content/content-script.ts'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    target: 'es2020',
    minify: false
  },
});