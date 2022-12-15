import sharp from 'sharp';
import { readdir, mkdir, unlink, rename } from 'fs/promises';

async function files(folder: string, job: string) {
  const dir = `./${folder}/${job}`;
  const temp = `./${folder}/.temp`;
  const trash = `./${folder}/trash`;

  await mkdir(dir, { recursive: true }).catch(() => {});
  await mkdir(temp, { recursive: true }).catch(() => {});
  await mkdir(trash, { recursive: true }).catch(() => {});

  const files = await readdir(dir);

  if (!files.length) {
    console.log('\x1b[31m', 'FOLDER KOSONG!', '\x1b[37m');
    process.exit(1);
  }

  return {
    files,
    async compressFile(file: string) {
      try {
        await sharp(`${dir}/${file}`).jpeg({ quality: 30 }).toFile(`${temp}/${file}`);
        return true;
      } catch (e: any) {
        console.log(e.message);
        return false;
      }
    },

    async cleanup(file: string) {
      try {
        await rename(`${temp}/${file}`, `${trash}/${file}`);
        await unlink(`${dir}/${file}`);
      } catch (e: any) {
        console.log(e.message);
      }
    },

    async skip(file: string) {
      try {
        await rename(`${dir}/${file}`, `${trash}/${file}`);
      } catch (e: any) {
        console.log(e.message);
      }
    },
  };
}

export default files;
