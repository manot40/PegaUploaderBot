// Needed Vendor Libs
const chalk = require('chalk');
const clear = require('clear');
const figlet = require('figlet');

// Input and Puppeteer Lib
const inquirer  = require('./src/inquirer');
const bot  = require('./src/bot-core');

const appcfg = require('./config');

clear();

console.log(
  chalk.green(
    figlet.textSync(appcfg.jobName, { horizontalLayout: 'full' })
  )
);
console.log('\n Ver: 1.2.4 \n');

const run = async () => {
  !appcfg.fastLogin.enabled ? await inquirer.cobaLogin() : await inquirer.loginSkip();
  await inquirer.pilihJob();
  await inquirer.pastiin();
  worker();
}
const worker = async () => {
  const mulaiJob = await bot.mulaiJob();
  if(!mulaiJob) {
    console.log('\x1b[37m','Retrying...\n');
    worker();
  } 
  run();
};

run();