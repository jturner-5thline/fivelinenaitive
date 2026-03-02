import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom')) return 'vendor-react-dom';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-editor';
            if (id.includes('three') || id.includes('@react-three')) return 'vendor-three';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('date-fns')) return 'vendor-datefns';
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('docx') || id.includes('exceljs')) return 'vendor-export';
          }
        },
      },
    },
  },
}));
