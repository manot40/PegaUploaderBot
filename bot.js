// Needed Vendor Libs
const chalk = require('chalk');
const clear = require('clear');
const figlet = require('figlet');

// Input and Puppeteer Lib
const { cobaLogin, loginSkip, pilihJob }  = require('./src/inquirer');
const bot  = require('./src/core');
const config = require('./config');

clear();

console.log(
  chalk.green(
    figlet.textSync(config.jobName, { horizontalLayout: 'full' })
  )
);
console.log('\n Ver: 1.2.4 \n');

const run = async () => {
  !config.fastLogin.enabled ? await cobaLogin() : await loginSkip();
  await pilihJob();
  worker();
}
const worker = async () => {
  const mulaiJob = await bot.mulaiJob();
  if(!mulaiJob) {
    console.log('\x1b[37m','Retrying...\n');
    worker();
  } 
};

run();