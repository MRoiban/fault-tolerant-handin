/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
    base: "./", // relative paths: the page works from file:// and from any web folder
    // Inline all JS and CSS into dist/index.html, so the page runs offline by just opening the file.
    plugins: [viteSingleFile()],
    build: { target: "es2022", chunkSizeWarningLimit: 2000 },
    test: { include: ["src/**/*.test.ts"] },
});
