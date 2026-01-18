import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../out/webview',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'index.html'),
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }
    },
    base: './'
});
//# sourceMappingURL=vite.config.js.map