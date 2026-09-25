import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything (code, WASM, models, textures, lightmaps, sky) is inlined into one HTML file
// so the game runs offline from a single file.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  assetsInclude: ['**/*.glb', '**/*.hdr', '**/*.bin'],
  build: {
    target: 'es2022',
    assetsInlineLimit: () => true,
    chunkSizeWarningLimit: 100000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    sourcemap: false,
  },
  server: { host: '127.0.0.1', port: 5173 },
});
