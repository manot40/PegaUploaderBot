import * as p from '@clack/prompts';
import { MainBot } from './bot';
import { formatErrorMessage, logError } from './error';

process.on('unhandledRejection', (err) => {
  logError(err);
});
process.on('uncaughtException', (err) => {
  logError(err);
});

export async function main() {
  const bot = new MainBot();
  await bot.run();
}

if (import.meta.main) {
  main().catch((err) => {
    logError(err);
    p.cancel(formatErrorMessage(err));
    process.exit(1);
  });
}
