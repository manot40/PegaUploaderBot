import kleur from 'kleur';
import config from 'config';
import FileHandler from 'files';

import { checkLicense } from 'utils';
import { ClassicBot, DirectBot } from 'bot';
import { confirm, inputLogin, chooseJob } from 'input';

main();
console.log(kleur.green(config.jobName));
console.log('\n Ver: 2.2.5 \n');

async function main() {
  await checkLicense();

  let formNode = 0;
  const line = '-'.repeat(58);

  const bot = config.isDirect ? new DirectBot() : new ClassicBot();
  const handler = new FileHandler();

  await handler
    .init()
    .then(inputLogin)
    .then(chooseJob)
    .then((job) => handler.scanDir(job.name))
    .then((files) => confirm(files.length))
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
      if (!!formNode && formNode % 5 === 0) {
        formNode = 0;
        await bot.reload();
      }

      formNode++;
      console.log('Current file:', file);

      // Bot Operations
      await bot.openForm();
      if (bot instanceof ClassicBot) await bot.createIframe(formNode);
      await bot.handleForm(compressed);
      await bot.finishing();

      // Cleanup
      await handler.cleanup(file);
      if (formNode === 15) formNode = 0;
      console.log(`${kleur.green('UPLOAD SUKSES!')} Sisa file: ${--remaining}`);
    } catch (e: any) {
      console.error(`${kleur.red(`Tidak dapat mengupload file ${file}`)}. Reason: ${e.message}`);
    }
  }

  console.log(line);
  console.log('All Job Done!');
  process.exit(0);
}

process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);
async function handleError(error: Error) {
  console.error(kleur.red('Fatal:'), error?.message || 'Unknown Error');
  console.info('Press CTRL+C to exit...');
  await new Promise((r) => process.stdin.once('data', r));
  process.exit(1);
}
