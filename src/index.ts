import Bot from './bot';
import kleur from 'kleur';
import config from './config';

import FileHandler from './files';
import { confirm, inputLogin, chooseJob } from './input';

main();
console.log(kleur.green(config.jobName));
console.log('\n Ver: 2.2.4 \n');

async function main() {
  let iframeNode = 0;
  const bot = new Bot();
  const line = '-'.repeat(58);

  await inputLogin();

  const job = await chooseJob();
  const handler = new FileHandler(job);

  await handler
    .init()
    .then((h) => confirm(h.files.length))
    .then(() => bot.login());

  let remaining = handler.files.length;
  for (const file of handler.files) {
    try {
      console.log(line);
      const { result: compressed } = await handler.compress(file);

      if (!compressed) {
        await handler.trash(file);
        console.log(kleur.red('File cannot be compressed!'));
        console.log(`${file} will be skipped`);
        continue;
      }

      // Out-of-Memory Prevention
      if (!!iframeNode && iframeNode % 5 === 0) {
        iframeNode = 0;
        await bot.reload();
      }

      iframeNode++;
      console.log('Current file:', file);

      // Bot Operations
      await bot.beginInput();
      await bot.createForm(iframeNode);
      await bot.handleForm(file);
      await bot.uploadFile(file);
      await bot.finishing();

      // Cleanup
      await handler.cleanup(file);
      if (iframeNode === 15) iframeNode = 0;
      console.log(`${kleur.green('UPLOAD SUKSES!')} Sisa file: ${--remaining}`);
    } catch (e: any) {
      console.error(`${kleur.red(`Tidak dapat mengupload file ${file}`)}. Reason: ${e.message}`);
    }
  }

  console.log(line);
  console.log('All Job Done!');
  process.exit(0);
}
