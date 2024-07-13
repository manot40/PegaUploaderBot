import fs from 'fs/promises';
import kleur from 'kleur';
import config from './config';

import { cpus } from 'os';
import { ImagePool, type EncodeResult } from '@squoosh/lib';

const folder = config.folder;
const imagePool = new ImagePool(cpus().length);

class FileHandler {
  private dir: string | null = null;
  private temp: string;
  private trashDir: string;
  private initialized = false;

  public files: string[] = [];

  constructor() {
    this.temp = `./${folder}/.temp`;
    this.trashDir = `./${folder}/trash`;
  }

  async init() {
    if (this.initialized) return this;
    await Promise.allSettled([
      fs.mkdir(this.temp, { recursive: true }),
      fs.mkdir(this.trashDir, { recursive: true }),
      ...config.jobs.map((job) => {
        return fs.mkdir(`./${folder}/${job.name}`, { recursive: true });
      }),
    ]);

    this.initialized = true;
    return this;
  }

  async scanDir(dir: string) {
    this.dir = `./${folder}/${dir}`;
    const files = (this.files = await fs.readdir(this.dir));

    if (!files.length) {
      console.log(kleur.red('FOLDER KOSONG!'));
      process.exit(1);
    }

    return files;
  }

  async compress(file: string | number): Promise<Result<EncodeResult>> {
    try {
      if (!this.dir) throw new Error('Directory not set!');
      const _file = typeof file === 'number' ? this.files[file] : file;
      const fileBuff = await fs.readFile(`${this.dir}/${_file}`);

      const image = imagePool.ingestImage(fileBuff);
      const { mozjpeg: result } = await image.encode({ mozjpeg: { quality: 65 } });

      const fileName = `${this.temp}/${_file}${!/(jpe?g)/.test(_file) ? '.'.concat(result.extension) : ''}`;
      await fs.writeFile(fileName, result.binary);
      return { result };
    } catch (error: any) {
      console.error(error.message);
      return { error };
    }
  }

  async cleanup(file: string | number): Promise<Result<true>> {
    try {
      if (!this.dir) throw new Error('Directory not set!');
      const _file = typeof file === 'number' ? this.files[file] : file;
      const dir = [`${this.temp}/${_file}`, `${this.trashDir}/${_file}`] as const;
      return fs.rename(...dir).then(() => {
        fs.unlink(`${this.dir}/${_file}`).catch(() => void 0);
        return { result: true };
      });
    } catch (error: any) {
      return { error };
    }
  }

  async trash(file: string | number): Promise<Result<true>> {
    try {
      if (!this.dir) throw new Error('Directory not set!');
      const _file = typeof file === 'number' ? this.files[file] : file;
      await fs.rename(`${this.dir}/${_file}`, `${this.trashDir}/${_file}`);
      return { result: true };
    } catch (error: any) {
      console.log(error.message);
      return { error };
    }
  }
}

type Result<T> = { result: T; error?: never } | { result?: never; error: Error };

export default FileHandler;
