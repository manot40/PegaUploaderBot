import config, { jobs, fastLogin, folder } from './config';
import { confirm, inputLogin, chooseJob } from './input';
import Uploads from './uploads';
import store from './store';
import clear from 'clear';
import chalk from 'chalk';
import Bot from './bot';

clear();
console.log(chalk.green(config.jobName));
console.log('\n Ver: 2.2.0 \n');

async function app() {
  const line = '----------------------------------------------------------';

  let bot;
  let workDir;
  let isLoggedIn;
  let pegaGadget = 0;
  let resetCounter = 0;

  while (!isLoggedIn) {
    await inputLogin(fastLogin);

    if (typeof isLoggedIn === 'undefined') {
      await chooseJob(jobs);
      workDir = await Uploads(folder, store.getJob(1));
      await confirm(workDir.uploads.length);
      bot = await Bot(config);
    }

    isLoggedIn = await bot.login();
  }

  let remained = workDir.uploads.length;

  // Begin uploading tasks
  for (const file of workDir.uploads) {
    if (config.antiLag) {
      if (resetCounter === 5) {
        resetCounter = 0;
        console.log('Reloading to avoid lag...');
        await bot.reloadPage();
        await bot.sleep(2000);
      } else {
        resetCounter++;
      }
    }
    console.log(line);
    if (await workDir.compressUpload(file)) {
      pegaGadget < 15 ? pegaGadget++ : (pegaGadget = 1);
      console.log('Current file: ' + file);
      bot.setNode(pegaGadget);
      await bot.beginInput();
      await bot.createForm();
      await bot.handleForm(file);
      await bot.uploadFile(file);
      await bot.finishing();
      await workDir.uploadDone(file);
      console.log('UPLOAD SUKSES! Sisa upload: ' + --remained);
    } else {
      await workDir.skipUpload(file);
      console.log('\x1b[31m', 'File cannot be compressed!');
      console.log('\x1b[37m', file + ' will be skipped');
    }
  }

  console.log(line);
  console.log('All Job Done!');
  process.exit(0);
}

export default app;
