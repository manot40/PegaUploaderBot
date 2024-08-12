import fs from 'fs/promises';
import { build } from 'esbuild';

build({
  bundle: true,
  minify: true,
  target: 'node18',
  outfile: 'dist/index.js',
  platform: 'node',
  external: ['./vips/index.js'],
  sourcemap: true,
  entryPoints: ['src/index.ts'],
  define: {
    'process.env.TOKEN': `"${process.env.TOKEN}"`,
    'process.env.AUTH_URL': `"${process.env.AUTH_URL}"`,
  },
})
  .then(() => fs.cp('src/vips', 'dist/vips', { recursive: true }))
  .then(() => fs.unlink('dist/vips/index.d.ts'));
