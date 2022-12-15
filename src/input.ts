import type { Config } from 'config';

import store from './store';
import { prompt } from 'inquirer';

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

export const inputLogin = async (fastLogin: Config['fastLogin']) => {
  if (fastLogin.enabled) {
    console.log('\x1b[31m', 'Fast Login Active');
    store.setAuth(fastLogin.username, fastLogin.password);
    console.log('\x1b[37m', `Logged in as: ${fastLogin.username}\n`);
  } else {
    await prompt(login);
  }
};

export const chooseJob = async (jobs: Config['jobs']) => {
  if (!jobs?.length) throw new Error('No job list found');

  const { job } = await prompt({
    name: 'job',
    type: 'list',
    message: 'Choose job to be uploaded:',
    choices: jobs,
  }).catch(() => {});

  const jobId = (+job.match(/(?<=\()(.*)(?=\))/g)[0]).toString();
  const jobName = job.match(/(?<=\))(.*)/g)[0]?.trim();
  store.setJob([jobId, jobName]);
};

export const confirm = async (len: number | string) => {
  await prompt(makeSure(len)).then((res) => {
    if (!res.sure) {
      console.log('Okay, take your time.');
      process.exit(0);
    }
  });
};
