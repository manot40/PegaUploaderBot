require("esbuild").build({
  bundle: true,
  minify: true,
  target: "node14",
  platform: "node",
  outfile: "dist/index.js",
  entryPoints: ["index.js"],
  external: ["puppeteer", "sharp", "../config"],
});
