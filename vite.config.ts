// vite.config.ts
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import fs from 'fs';

function generateManifest(): PluginOption {
  return {
    name: 'generate-manifest',
    writeBundle(options, bundle) {
      const manifestTemplate = JSON.parse(fs.readFileSync('src/manifest.template.json', 'utf-8'));
      
      const resources = Object.keys(bundle)
        .filter(fileName => fileName.endsWith('.js') || fileName.endsWith('.css'));

      manifestTemplate.web_accessible_resources = [
        {
          "resources": resources,
          "matches": [ "https://*.caixa.gov.br/*" ]
        }
      ];

      const outDir = options.dir || 'dist';
      fs.writeFileSync(path.resolve(outDir, 'manifest.json'), JSON.stringify(manifestTemplate, null, 2));
      console.log('Generated manifest.json with dynamic resources.');
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: 'popup.html', dest: '.' },
        { src: 'public/images/*', dest: 'images' }
      ]
    }),
    generateManifest()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup.tsx'),
        background: path.resolve(__dirname, 'src/background.ts'),
        caixaNavigation: path.resolve(__dirname, 'src/CaixaNavigator.tsx'),
        caixaNavigationSecondStep: path.resolve(__dirname, 'src/CaixaNavigatorSecondStep.tsx'),
      },
      output: {
        format: 'es',
        entryFileNames: chunkInfo => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'popup') return 'popup.js';
          if (chunkInfo.name === 'caixaNavigation') return 'caixaNavigation.js';
          if (chunkInfo.name === 'caixaNavigationSecondStep') return 'caixaNavigationSecondStep.js';
          return '[name].[hash].js';
        },
        chunkFileNames: '[name].[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) return '[name].css';
          return '[name].[hash].[ext]';
        }
      }
    }
  }
});
