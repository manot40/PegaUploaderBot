import fs from 'fs/promises';
import path from 'path';

import { author, description, license, name, version } from './package.json';

async function build() {
  const outDir = path.join(process.cwd(), 'dist');
  await fs.mkdir(outDir, { recursive: true });

  // Clean old build artifacts in dist
  const existingFiles = await fs.readdir(outDir);
  for (const file of existingFiles) {
    if (file !== 'bot-pega-mitra.exe') {
      await fs.rm(path.join(outDir, file), { recursive: true, force: true }).catch(() => {});
    }
  }

  const buildArgs = {
    compile: {
      target: 'bun-windows-x64',
      outfile: `dist/${name}.exe`,
      autoloadDotenv: true,
    } as Bun.CompileBuildOptions,
    minify: true,
    bytecode: true,
    entrypoints: ['src/index.ts'],
    define: {
      'process.env.LICENSE_URL': getEnv('LICENSE_URL'),
      'process.env.LICENSE_USER': getEnv('LICENSE_USER'),
      'process.env.LICENSE_TOKEN': getEnv('LICENSE_TOKEN'),
    },
  } satisfies Bun.BuildConfig;

  if (process.platform === 'win32') {
    buildArgs.compile.windows = {
      icon: 'icon.ico',
      title: name,
      version,
      copyright: `${author} © ${license}`,
      description,
    };
  }

  await Bun.build(buildArgs);
}

const getEnv = (key: string, fallback = '') => `"${process.env[key] || fallback}"`;

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
