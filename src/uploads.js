import { readdir, mkdir, unlink, rename } from "fs/promises";
import sharp from "sharp";

const uploads = async (folder, job) => {
  const dir = `./${folder}/${job}`;
  const temp = `./${folder}/.temp`;
  const trash = `./${folder}/trash`;

  await mkdir(dir).catch(() => {});
  await mkdir(temp).catch(() => {});
  await mkdir(trash).catch(() => {});

  const uploads = await readdir(dir);

  if (!uploads.length) {
    console.log("\x1b[31m", "FOLDER KOSONG!");
    console.log("\x1b[37m", "");
    process.exit(1);
  }
  return {
    uploads,
    async compressUpload(file) {
      try {
        await sharp(`${dir}/${file}`)
          .jpeg({ quality: 30 })
          .toFile(`${temp}/${file}`);
        return true;
      } catch (err) {
        console.log(err.message);
        return false;
      }
    },
    async uploadDone(file) {
      try {
        await rename(`${temp}/${file}`, `${trash}/${file}`);
        await unlink(`${dir}/${file}`);
      } catch (err) {
        console.log(err.message);
      }
    },
    async skipUpload(file) {
      try {
        await rename(`${dir}/${file}`, `${trash}/${file}`);
      } catch (err) {
        console.log(err.message);
      }
    },
  };
};

export default uploads;
