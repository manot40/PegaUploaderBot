import config from './config';
import inquirer from 'inquirer';

import store from './store';

const prompt = inquirer.createPromptModule();

const login = [
  {
    name: 'username',
    type: 'input',
    message: 'Username:',
    validate(value: string) {
      if (value.length) {
        store.setUsername(value);
        return true;
      } else {
        return 'Masukin username yang bener jancok.';
      }
    },
  },
  {
    name: 'password',
    type: 'password',
    message: 'Password:',
    validate(value: string) {
      if (value.length) {
        store.setPassword(value);
        return true;
      } else {
        return 'Masukin password yang bener jancok.';
      }
    },
  },
];

const makeSure = (total: number | string) => ({
  name: 'sure',
  type: 'confirm' as any,
  message: `${total} file(s) found. All good? (Enter)`,
  default: true,
});

export async function inputLogin() {
  const fl = config.fastLogin;
  if (fl?.enabled) {
    console.log('\x1b[31m', 'Fast Login Active');
    store.setUsername(fl.username).setPassword(fl.password);
    console.log('\x1b[37m', `Logged in as: ${fl.username}\n`);
  } else {
    await prompt(login);
  }
}

export async function chooseJob() {
  if (!config.jobs.length) throw new Error('No job list found');

  const choices = config.jobs.map((job) => ({
    name: job.name,
    value: { name: job.name, id: `${+job.id}` },
  }));

  const { job } = await prompt({
    name: 'job',
    type: 'list',
    choices,
    message: 'Choose job to be uploaded:',
  });

  return store.setJob(job).job!;
}

export const confirm = async (len: number | string) => {
  await prompt(makeSure(len)).then((res) => {
    if (!res.sure) {
      console.log('Okay, take your time.');
      process.exit(0);
    }
  });
};
