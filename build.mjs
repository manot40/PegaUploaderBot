import fs from 'fs/promises';
import { build } from 'esbuild';

build({
  bundle: true,
  minify: true,
  target: 'node16',
  outfile: 'dist/index.js',
  platform: 'node',
  external: ['./vips/index.js'],
  sourcemap: true,
  entryPoints: ['src/index.ts'],
})
  .then(() => fs.cp('src/vips', 'dist/vips', { recursive: true }))
  .then(() => fs.unlink('dist/vips/index.d.ts'));
