import fs from 'fs/promises';
import path from 'path';
import kleur from 'kleur';
import config from './config';

import Vips from './vips/index.js';

class FileHandler {
  public files: string[] = [];

  private dir: string | null = null;
  private vips: typeof Vips | null = null;
  private temp: string;
  private workDir: string;
  private trashDir: string;
  private initialized = false;

  constructor(public folder = config.folder) {
    this.workDir = path.join(process.cwd(), folder);
    this.temp = path.join(this.workDir, '.temp');
    this.trashDir = path.join(this.workDir, 'trash');
  }

  static remExt(file: string) {
    const regex = /\.[a-z0-9]+$/i;
    return file.replace(regex, '').trim();
  }

  async init() {
    if (this.initialized) return this;

    const vips = (this.vips = await Vips());
    vips.Cache.maxFiles(2);
    vips.Cache.max(3);

    await Promise.allSettled([
      fs.mkdir(this.temp, { recursive: true }),
      fs.mkdir(this.trashDir, { recursive: true }),
      ...config.jobs.map((job) => {
        return fs.mkdir(path.join(this.workDir, job.name), { recursive: true });
      }),
    ]);

    this.initialized = true;
    return this;
  }

  async scanDir(dir: string) {
    const target = path.join(this.workDir, dir);
    const files = (this.files = await fs.readdir(target));

    if (!files.length) {
      console.log(kleur.red('FOLDER KOSONG!'));
      process.exit(1);
    } else {
      this.dir = target;
    }

    return files;
  }

  async compress(file: string | number): Promise<Result<string>> {
    try {
      if (!this.dir) throw new Error('Directory not set!');
      if (!this.vips) throw new Error('Vips lib not loaded yet!');

      const fileName = typeof file === 'number' ? this.files[file] : file;
      const filePath = path.join(this.dir, fileName);
      const image = this.vips.Image.newFromFile(filePath, { access: this.vips.Access.sequential });

      let result: Uint8Array;
      if (image.width > 1920) {
        const thumb = image.thumbnailImage(image.width / 4);
        result = thumb.writeToBuffer('.jpg', { Q: 75 });
        thumb.delete();
      } else {
        result = image.writeToBuffer('.jpg', { Q: 60 });
      }

      const saveName = `${FileHandler.remExt(fileName)}.jpg`;
      await fs.writeFile(`${this.temp}/${saveName}`, result);
      image.delete();

      return { result: saveName };
    } catch (error: any) {
      console.error(error.message);
      return { error };
    }
  }

  async cleanup(file: string | number): Promise<Result<true>> {
    try {
      if (!this.dir) throw new Error('Directory not set!');
      const _file = typeof file === 'number' ? this.files[file] : file;
      const fileJpg = FileHandler.remExt(_file) + '.jpg';
      const dir = [`${this.temp}/${fileJpg}`, `${this.trashDir}/${fileJpg}`] as const;
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
