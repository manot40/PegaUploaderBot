import type { Job } from 'store';

import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.BOT_BROWSER) {
  console.error('Browser location is not defined!');
  process.exit(1);
}

if (!fs.existsSync('./jobs.json')) {
  console.error('Jobs file does not exist!');
  process.exit(1);
}

let jobs: Job[];

try {
  const escape = (str: string) => str.replace(/(\\|\/)/g, ' ');
  const data = JSON.parse(fs.readFileSync('./jobs.json', { encoding: 'utf8' }));
  if (!Array.isArray(data)) throw new Error();
  jobs = data.map((d) => ({ ...d, name: escape(d.name) }));
} catch (e) {
  console.error('Invalid jobs definition!');
  process.exit(1);
}

const config = {
  // Normally not changed
  folder: 'images',
  url: process.env.BOT_URL || '',
  silent: process.env.BOT_SILENT === 'true',
  isDirect: process.env.BOT_DIRECT === 'true',
  chromePath: process.env.BOT_BROWSER,
  // Set pages timeout (in second)
  timeout: process.env.BOT_TIMEOUT || 10,
  // Fast login mode, set true to skip login inquirer every time use the bot
  fastLogin: {
    enabled: process.env.BOT_FASTLOGIN === 'true',
    username: process.env.BOT_USERNAME || '',
    password: process.env.BOT_PASSWORD || '',
  },
  jobName: process.env.BOT_NAME || 'The Job Name',
  // Make sure to create new folder inside 'images' folder corresponding to your job list
  jobs,
  config: {},
};

export type Config = typeof config;

export default Object.freeze(config);
