import { readFileSync, existsSync } from 'fs';

if (!process.env.BOT_BROWSER) {
  console.error('Browser location is not defined!');
  process.exit(1);
}

if (!existsSync('./jobs.json')) {
  console.error('Jobs file does not exist!');
  process.exit(1);
}

/** @type {{ id: string[], name: string[], custom: string[] }} */
let JOBS;

try {
  JOBS = JSON.parse(readFileSync('./jobs.json', { encoding: 'utf8' }));
} catch (e) {
  console.error('Invalid jobs definition!');
  process.exit(1);
}

const config = {
  // Normally not changed
  folder: 'images',
  url: process.env.BOT_URL || '',
  silent: process.env.BOT_SILENT === 'true',
  chromePath: process.env.BOT_BROWSER,
  // Set pages timeout (in second)
  timeout: process.env.BOT_TIMEOUT || 10,
  // Workaround for lag on low spec PC
  antiLag: process.env.BOT_ANTILAG === 'true',
  // Fast login mode, set true to skip login inquirer every time use the bot
  fastLogin: {
    enabled: process.env.BOT_FASTLOGIN === 'true',
    username: process.env.BOT_USERNAME || '',
    password: process.env.BOT_PASSWORD || '',
  },
  jobName: process.env.NAME || 'The Job Name',
  // Set true for unique description per post or false for auto generated description
  customDesc: JOBS.custom,
  // Make sure to create new folder inside 'images' folder corresponding to your job list
  jobs: JOBS.id.map((id, i) => `(${id}) ${JOBS.name[i]}`),
  config: {},
};

module.exports = config;
