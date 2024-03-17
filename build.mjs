import { build } from 'esbuild';

build({
  bundle: true,
  minify: true,
  target: 'node16',
  outfile: 'dist/index.js',
  platform: 'node',
  external: ['sharp'],
  sourcemap: true,
  entryPoints: ['src/index.ts'],
});
