const jobsId = process.env.BOT_JOBLIST_ID?.split(',') || [];
const jobsName = process.env.BOT_JOBLIST_NAME?.split(',') || [];

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
  jobName: process.env.JOB_NAME || 'The Job Name',
  // Set true for unique description per post or false for auto generated description
  customDesc: process.env.BOT_CUSTOM_JOB_DESC?.split(',') || [],
  // Make sure to create new folder inside 'images' folder corresponding to your job list
  jobs: jobsId.map((id, i) => `(${id}) ${jobsName[i]}`),
  config: {},
};

module.exports = config;
