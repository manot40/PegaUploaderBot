import { confirm, inputLogin, chooseJob } from './input';
import config from './config';
import files from './files';
import store from './store';
import clear from 'clear';
import chalk from 'chalk';
import Bot from './bot';

clear();
console.log(chalk.green(config.jobName));
console.log('\n Ver: 2.4.0 \n');

(async () => {
  let pegaGadget = 0;
  const bot = new Bot(config);
  const line = '-'.repeat(58);

  await inputLogin(config.fastLogin);
  await chooseJob(config.jobs);
  const workDir = await files(config.folder, store.getJob(1));
  await confirm(workDir.files.length);

  // Begin uploading tasks
  await bot.login();
  let remaining = workDir.files.length;
  for (const file of workDir.files) {
    try {
      console.log(line);
      if (await workDir.compressFile(file)) {
        // Prevent Memory Leak
        if (!!pegaGadget && pegaGadget % 5 === 0) {
          pegaGadget = 0;
          await bot.reload();
        }

        // Initialization
        console.log('Current file:', file);
        bot.setNode(++pegaGadget);
        bot.setFile(file);

        // Bot Operations
        await bot.beginInput();
        await bot.createForm();
        await bot.handleForm();
        await bot.uploadFile();
        await bot.finishing();

        // Cleanup
        await workDir.cleanup(file);
        if (pegaGadget === 15) pegaGadget = 0;
        console.log('UPLOAD SUKSES! Sisa upload: ' + --remaining);
      } else {
        await workDir.skip(file);
        console.log('\x1b[31m', 'File cannot be compressed!');
        console.log('\x1b[37m', file + ' will be skipped');
      }
    } catch (e: any) {
      console.error(`\x1b[31m Tidak dapat mengupload file ${file}. Reason: ${e.message} \x1b[37m`);
    }
  }

  console.log(line);
  console.log('All Job Done!');
  process.exit(0);
})();
