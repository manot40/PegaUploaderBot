import { readdir } from "fs/promises";

export default async (folder, job) => {
  const uploads = await readdir(folder + '/' + job + '/');
  if (uploads.length) {
    console.log('\n');
    console.log('----------------');
    console.log('Total file: ' + uploads.length);
    console.log('----------------\n');
  } else {
    console.log('\x1b[31m', 'FOLDER KOSONG!');
    console.log('\x1b[37m', '');
    process.exit();
  }
  return {
    uploads,
    uploadDone() {

    }
  }
}