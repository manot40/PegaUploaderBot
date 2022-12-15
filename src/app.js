import config, { jobs, fastLogin, folder } from './config';
import { confirm, inputLogin, chooseJob } from './input';
import uploads from './uploads';
import store from './store';
import clear from 'clear';
import chalk from 'chalk';
import Bot from './bot';

clear();
console.log(chalk.green(config.jobName));
console.log('\n Ver: 2.4.0 \n');

async function app() {
  const line = '-'.repeat(58);

  let bot;
  let workDir;
  let isLoggedIn;
  let pegaGadget = 0;

  while (!isLoggedIn) {
    await inputLogin(fastLogin);

    if (typeof isLoggedIn === 'undefined') {
      await chooseJob(jobs);
      workDir = await uploads(folder, store.getJob(1));
      await confirm(workDir.uploads.length);
      bot = await Bot(config);
    }

    isLoggedIn = await bot.login();
  }

  let remained = workDir.uploads.length;

  // Begin uploading tasks
  for (const file of workDir.uploads) {
    console.log(line);
    if (await workDir.compressUpload(file)) {
      if (!!pegaGadget && pegaGadget % 5 === 0) {
        pegaGadget = 0;
        await bot.reloadBrowser();
      }

      pegaGadget++;
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
