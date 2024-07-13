import fs from 'fs/promises';
import { build } from 'esbuild';
import { createRequire } from 'module';

build({
  bundle: true,
  minify: true,
  target: 'node16',
  outfile: 'dist/index.js',
  platform: 'node',
  external: ['@squoosh/lib'],
  sourcemap: true,
  entryPoints: ['src/index.ts'],
}).then(async () => {
  const libs = ['@squoosh/lib', 'wasm-feature-detect', 'web-streams-polyfill'];
  fs.cp('package.json', 'dist/package.json');
  await Promise.all(libs.map((lib) => fs.cp(`node_modules/${lib}`, `dist/node_modules/${lib}`, { recursive: true })));
});
