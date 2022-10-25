require('esbuild').build({
  bundle: true,
  minify: true,
  target: 'node14',
  platform: 'node',
  external: ['sharp'],
  outfile: 'dist/index.js',
  entryPoints: ['index.js'],
});
