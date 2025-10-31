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

        const templateWAR = Array.isArray(manifestTemplate.web_accessible_resources)
          ? manifestTemplate.web_accessible_resources[0] ?? {}
          : {};

        const matches = Array.isArray(templateWAR.matches) && templateWAR.matches.length > 0
          ? templateWAR.matches
          : [ "https://*.caixa.gov.br/*" ];

      const staticResources = Array.isArray(templateWAR.resources) ? templateWAR.resources : [];
      const combinedResources = Array.from(new Set([...staticResources, ...resources]));

      manifestTemplate.web_accessible_resources = [
        {
          resources: combinedResources,
          matches
        }
      ];

      const outDir = options.dir || 'dist';
      fs.writeFileSync(path.resolve(outDir, 'manifest.json'), JSON.stringify(manifestTemplate, null, 2));
      console.log('Generated manifest.json with dynamic resources and matches from host_permissions.');
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
        popup: path.resolve(__dirname, 'src/popup/index.tsx'),
        background: path.resolve(__dirname, 'src/background/index.ts'),
        caixaNavigation: path.resolve(__dirname, 'src/content/caixa/Navigator.tsx'),
        caixaNavigationSecondStep: path.resolve(__dirname, 'src/content/caixa/SecondStepNavigator.tsx'),
        bbNavigation: path.resolve(__dirname, 'src/content/bb/Navigator.tsx'),
      },
      output: {
        format: 'es',
        entryFileNames: chunkInfo => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'popup') return 'popup.js';
          if (chunkInfo.name === 'caixaNavigation') return 'caixaNavigation.js';
          if (chunkInfo.name === 'caixaNavigationSecondStep') return 'caixaNavigationSecondStep.js';
          if (chunkInfo.name === 'bbNavigation') return 'bbNavigation.js';
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
