const inquirer = require('inquirer');
const config = require('../config');

// Custom Handler Lib
const param = require('./parameter');

module.exports = {
  cobaLogin: () => {
    const questions = [
      {
        name: 'username',
        type: 'input',
        message: 'Username:',
        validate: function (value) {
          if (value.length) {
            param.setUsername(value);
            return true;
          } else {
            return 'Masukin username yang bener jancok.';
          }
        }
      },
      {
        name: 'password',
        type: 'password',
        message: 'Password:',
        validate: function (value) {
          if (value.length) {
            param.setPassword(value);
            return true;
          } else {
            return 'Masukin password yang bener jancok.';
          }
        }
      }
    ];
    return inquirer.prompt(questions);
  },

  pilihJob: () => {
    const questions = [
      {
        name: 'job',
        type: 'list',
        message: 'Pilih Job yang mau dikerjain:',
        choices: config.jobs,
      },
    ];
    return inquirer.prompt(questions).then((answer) => {
      let val = JSON.stringify(answer);
      const jobID = parseInt(val.slice(9, 13), 10) - 0;
      param.setJob([jobID.toString(), val.slice(15, -2)]);
    });
  },

  pastiin: () => {
    const questions = [
      {
        name: 'sure',
        type: 'confirm',
        message: 'Udah lengkap? (Enter)',
        default: true,
      },
    ];
    return inquirer.prompt(questions);
  },

  loginSkip: () => {
    console.log('\x1b[31m', 'Fast Login Active');
    param.setAuth(config.fastLogin.username, config.fastLogin.password)
    console.log('\x1b[37m', 'Logged in as: ' + config.fastLogin.username + '\n');
  },
};