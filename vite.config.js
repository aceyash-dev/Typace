import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const dist = resolve(root, "dist");
const staticFiles = [
  "favicon.ico",
  "icon.png",
  "og-image.png",
  "humans.txt",
  "robots.txt",
  "llms.txt",
  "llms-full.txt"
];

const preservePublicAssets = {
  name: "preserve-typace-public-assets",
  apply: "build",
  closeBundle() {
    mkdirSync(dist, { recursive: true });
    const fontSource = resolve(root, "fonts");
    if (!existsSync(fontSource)) throw new Error("The required fonts/ asset directory is missing.");
    cpSync(fontSource, resolve(dist, "fonts"), { recursive: true, force: true });
    for (const file of staticFiles) {
      const source = resolve(root, file);
      if (existsSync(source)) copyFileSync(source, resolve(dist, file));
    }
  }
};

export default defineConfig({
  plugins: [react(), preservePublicAssets],
  base: "/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    host: "0.0.0.0"
  }
});
