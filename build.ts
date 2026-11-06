import fs from 'fs/promises';
import path from 'path';
import { color } from './src/color';

async function build() {
  console.log(color.cyan('Memulai proses kompilasi standalone Windows x64...'));

  const outDir = path.join(process.cwd(), 'dist');
  await fs.mkdir(outDir, { recursive: true });

  // Clean old build artifacts in dist
  const existingFiles = await fs.readdir(outDir);
  for (const file of existingFiles) {
    if (file !== 'bot-pega-mitra.exe') {
      await fs.rm(path.join(outDir, file), { recursive: true, force: true }).catch(() => {});
    }
  }

  const authUrl = process.env.LICENSE_URL ? `"${process.env.LICENSE_URL}"` : '"false"';
  const token = process.env.LICENSE_TOKEN ? `"${process.env.LICENSE_TOKEN}"` : '"false"';
  const user = process.env.LICENSE_USER ? `"${process.env.LICENSE_USER}"` : '"false"';

  const args = [
    'bun',
    'build',
    'src/index.ts',
    '--compile',
    '--bytecode',
    '--target=bun-windows-x64',
    '--outfile=dist/bot-pega-mitra.exe',
    '--minify',
    `--define`,
    `process.env.LICENSE_URL=${authUrl}`,
    `--define`,
    `process.env.LICENSE_TOKEN=${token}`,
    `--define`,
    `process.env.LICENSE_USER=${user}`,
  ];

  if (process.platform === 'win32') args.push('--windows-icon=icon.ico');

  const proc = Bun.spawn(args, {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(color.red(`Kompilasi gagal dengan exit code ${exitCode}`));
    process.exit(exitCode);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
