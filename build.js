require('esbuild').build({
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'node14',
  platform: 'node',
  external: ['sharp'],
  outfile: 'dist/index.js',
  entryPoints: ['src/index.ts'],
});
