const inquirer = require('inquirer');
const appcfg = require('../config');

// Custom Handler Lib
const files  = require('./files');
const param  = require('./parameter');

module.exports = {
  cobaLogin: () => {
    const questions = [
      {
        name: 'username',
        type: 'input',
        message: 'Username:',
        validate: function( value ) {
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
        validate: function(value) {
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
        choices: appcfg.jobs,
      },
    ];
    return inquirer.prompt(questions).then((answer) => {
      let val = JSON.stringify(answer);
      const jobID = parseInt(val.slice(9,13), 10)-0;
      param.setJob([jobID.toString(), val.slice(15,-2)]);
    });
  },

  pastiin: () => {
	files.checkFotoBuatUpload(param.getJob(1));
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
    param.setAuth(appcfg.fastLogin.username, appcfg.fastLogin.password)
    console.log('\x1b[37m', 'Logged in as: ' + appcfg.fastLogin.username + '\n');
  },
};